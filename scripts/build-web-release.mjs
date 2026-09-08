#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawn } from "node:child_process";

const rootDir = process.cwd();
const nodeBin = process.execPath;

async function ensure(path, label) {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} not found at ${path}`);
  }
}

const generatedListingPayloadPattern = /^(?:products(?:-\d{4})?|product-search(?:-\d{4})?|home-(?:featured|collection)-products)\.json$/;

async function removeGeneratedListingPayloads(distRoot) {
  const dataDir = resolve(distRoot, "data");
  let entries = [];

  try {
    entries = await readdir(dataDir);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }

  await Promise.all(
    entries
      .filter((entry) => generatedListingPayloadPattern.test(entry))
      .map((entry) => rm(resolve(dataDir, entry), { force: true })),
  );
}

function run(command, args, env = process.env, cwd = rootDir) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });

    child.on("error", rejectRun);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(new Error(`${command} ${args.join(" ")} failed with ${signal || `exit code ${code}`}`));
    });
  });
}

async function runViteBuild({ nodeModulesDir, buildEnv, stageDir, allowLocalFallback }) {
  const viteArgs = [resolve(nodeModulesDir, "vite", "bin", "vite.js"), "build"];

  try {
    await run(nodeBin, viteArgs, buildEnv, stageDir);
    return;
  } catch (error) {
    if (!allowLocalFallback) throw error;

    // OneDrive can return transient read errors through a dependency junction.
    // Retry from a local dependency copy without masking real build failures.
    console.warn("Shared dependency build failed; retrying with local node_modules copy.");
    await rm(nodeModulesDir, { recursive: true, force: true });
    await cp(resolve(rootDir, "node_modules"), nodeModulesDir, {
      recursive: true,
      force: true,
    });
    await run(nodeBin, viteArgs, {
      ...buildEnv,
      SALT_BUILD_SHARED_NODE_MODULES: "0",
    }, stageDir);
  }
}

async function prepareLocalNodeModules() {
  const lockPath = resolve(rootDir, "package-lock.json");
  const lockHash = createHash("sha256").update(await readFile(lockPath)).digest("hex").slice(0, 16);
  const cacheRoot = join(tmpdir(), `salt-release-dependencies-${lockHash}`);
  const cacheNodeModules = resolve(cacheRoot, "node_modules");
  const readyMarker = resolve(cacheRoot, ".ready");

  try {
    await access(readyMarker);
    return cacheNodeModules;
  } catch {
    // Provision below when this lockfile has not been cached locally yet.
  }

  await mkdir(cacheRoot, { recursive: true });
  await cp(resolve(rootDir, "package.json"), resolve(cacheRoot, "package.json"), { force: true });
  await cp(lockPath, resolve(cacheRoot, "package-lock.json"), { force: true });

  const npmArgs = ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"];
  if (process.env.npm_execpath) {
    execFileSync(nodeBin, [process.env.npm_execpath, ...npmArgs], {
      cwd: cacheRoot,
      env: process.env,
      stdio: "inherit",
    });
  } else {
    execFileSync("npm", npmArgs, {
      cwd: cacheRoot,
      env: process.env,
      stdio: "inherit",
    });
  }

  await writeFile(readyMarker, `${new Date().toISOString()}\n`, "utf8");
  return cacheNodeModules;
}

function getOneDrivePids(env = process.env) {
  if (env.SALT_BUILD_PAUSE_ONEDRIVE === "0" || !rootDir.includes("OneDrive")) {
    return [];
  }

  const processList = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  return processList
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.*)$/);
      return match ? { pid: Number(match[1]), command: match[2] } : null;
    })
    .filter(Boolean)
    .filter(({ command }) =>
      /\/Applications\/OneDrive\.app\/Contents\/MacOS\/OneDrive(?:\s|$)/.test(command)
      || /OneDrive File Provider\.appex\/Contents\/MacOS\/OneDrive File Provider/.test(command),
    )
    .map(({ pid }) => pid)
    .filter((pid) => pid !== process.pid);
}

function pauseOneDrive(env = process.env) {
  if (env.SALT_BUILD_SHARED_NODE_MODULES === "1") {
    return () => {};
  }
  const pids = getOneDrivePids(env);
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGSTOP");
    } catch {
      // The provider can exit between ps and kill; continue with local build.
    }
  }

  return () => {
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGCONT");
      } catch {
        // The provider may have been restarted with a new pid.
      }
    }
  };
}

async function main() {
  await ensure(resolve(rootDir, "output", "product-knowledge.json"), "validated product knowledge artifact");

  const stageDir = await mkdtemp(join(tmpdir(), "salt-web-build-"));
  const stageNodeModules = resolve(stageDir, "node_modules");
  const stageScripts = resolve(stageDir, "scripts");
  const useLocalNodeModules = rootDir.includes("OneDrive") && process.env.SALT_BUILD_LOCAL_NODE_MODULES !== "0";

  try {
    // Vite can be killed by the OneDrive file-provider while traversing the
    // dependency graph. Keep the graph and compiler cache on local storage.
    // Node's recursive copy can hang on an evicted OneDrive file-provider
    // handle. macOS cp streams the same tree without leaving a zero-byte
    // destination file behind, so the build can reach Vite reliably.
    execFileSync("cp", ["-R", resolve(rootDir, "src"), stageDir], {
      stdio: "inherit",
    });
    if (useLocalNodeModules) {
      // Use a local, lockfile-keyed npm cache rather than copying the
      // OneDrive dependency tree on every release.
      const localNodeModules = await prepareLocalNodeModules();
      await symlink(localNodeModules, stageNodeModules, "junction");
    } else {
      await symlink(resolve(rootDir, "node_modules"), stageNodeModules, "junction");
    }
    await mkdir(stageScripts, { recursive: true });
    await cp(resolve(rootDir, "scripts"), stageScripts, {
      recursive: true,
      force: true,
    });
    await cp(resolve(rootDir, "scripts", "postbuild-compat.mjs"), resolve(stageScripts, "postbuild-compat.mjs"));

    for (const filename of [
      "index.html",
      "vite.config.ts",
      "postcss.config.js",
      "tailwind.config.cjs",
      "tsconfig.json",
      "tsconfig.app.json",
      "tsconfig.node.json",
      "package.json",
      "package-lock.json",
      ".env",
      ".env.local",
      ".env.production",
    ]) {
      try {
        await cp(resolve(rootDir, filename), resolve(stageDir, filename), { force: true });
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }

    await symlink(resolve(rootDir, "public"), resolve(stageDir, "public"), "junction");
    await symlink(resolve(rootDir, "output"), resolve(stageDir, "output"), "junction");

    const buildEnv = {
      ...process.env,
      SALT_BUILD_SKIP_PUBLIC_COPY: "1",
      SALT_BUILD_SHARED_NODE_MODULES: useLocalNodeModules ? "0" : "1",
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=4096",
    };
    const resumeOneDrive = pauseOneDrive(buildEnv);
    try {
      await runViteBuild({
        nodeModulesDir: stageNodeModules,
        buildEnv,
        stageDir,
        allowLocalFallback: !useLocalNodeModules && rootDir.includes("OneDrive") && process.env.SALT_BUILD_LOCAL_FALLBACK !== "0",
      });
    } finally {
      resumeOneDrive();
    }

    execFileSync("cp", ["-R", resolve(rootDir, "public"), resolve(stageDir, "dist")], {
      stdio: "inherit",
    });
    await removeGeneratedListingPayloads(resolve(stageDir, "dist"));
    await run(nodeBin, [resolve(stageDir, "scripts", "postbuild-compat.mjs")], process.env, stageDir);
    await rm(resolve(rootDir, "dist"), { recursive: true, force: true });
    execFileSync("cp", ["-R", resolve(stageDir, "dist"), rootDir], {
      stdio: "inherit",
    });
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
