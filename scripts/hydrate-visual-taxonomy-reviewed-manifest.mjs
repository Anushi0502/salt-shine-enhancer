#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const defaultInputPath = resolve(rootDir, "output", "visual-taxonomy-reviewed-labels.jsonl");
const defaultOutputPath = resolve(rootDir, "output", "visual-taxonomy-reviewed-source-manifest.jsonl");
const concurrency = Math.max(1, Math.min(4, Number(process.env.SALT_VISUAL_MANIFEST_FETCH_CONCURRENCY || 2)));
const attempts = Math.max(1, Math.min(6, Number(process.env.SALT_VISUAL_MANIFEST_FETCH_ATTEMPTS || 4)));
const timeoutMs = Math.max(5_000, Number(process.env.SALT_VISUAL_MANIFEST_FETCH_TIMEOUT_MS || 60_000));

function parseJsonl(text) {
  return String(text || "").split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid reviewed-label JSONL at line ${index + 1}: ${error.message}`);
    }
  });
}

async function mapWithConcurrency(items, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function fetchDigest(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "image/avif,image/webp,image/jpeg,image/png,*/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`image HTTP ${response.status}`);
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType && !contentType.startsWith("image/")) throw new Error(`unexpected content type ${contentType}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.byteLength) throw new Error("image response was empty");
      return { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveSleep) => setTimeout(resolveSleep, 250 * 2 ** (attempt - 1)));
    }
  }
  throw lastError || new Error("image fetch failed");
}

function parseArgs(argv) {
  const args = { input: defaultInputPath, output: defaultOutputPath };
  const flags = new Map([["--input", "input"], ["--output", "output"]]);
  for (let index = 2; index < argv.length; index += 1) {
    const key = flags.get(argv[index]);
    if (!key || !argv[index + 1]) throw new Error(`Usage: ${argv[1]} [--input FILE] [--output FILE]`);
    args[key] = resolve(argv[index + 1]);
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const entries = parseJsonl(await readFile(args.input, "utf8"));
  if (!entries.length) throw new Error("Reviewed visual label manifest is empty.");
  const seenUrls = new Set();
  const hydrated = await mapWithConcurrency(entries, async (entry, index) => {
    const sourceUrl = String(entry?.sourceUrl || "").trim();
    if (!/^https?:\/\//i.test(sourceUrl)) throw new Error(`Reviewed label ${index + 1} has no valid sourceUrl.`);
    if (seenUrls.has(sourceUrl)) throw new Error(`Reviewed label manifest contains a duplicate sourceUrl: ${sourceUrl}`);
    seenUrls.add(sourceUrl);
    const digest = await fetchDigest(sourceUrl);
    return { ...entry, sha256: digest.sha256, bytes: digest.bytes };
  });
  hydrated.sort((left, right) => `${left.productId}\n${left.sourceUrl}`.localeCompare(`${right.productId}\n${right.sourceUrl}`));
  await mkdir(resolve(args.output, ".."), { recursive: true });
  const temporary = `${args.output}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${hydrated.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  await rename(temporary, args.output);
  const totalBytes = hydrated.reduce((total, entry) => total + entry.bytes, 0);
  process.stdout.write(`Hydrated ${hydrated.length} reviewed image labels (${totalBytes} bytes) at ${args.output}.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { fetchDigest, mapWithConcurrency, parseArgs, parseJsonl };
