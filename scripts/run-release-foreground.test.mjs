// @vitest-environment node

import { describe, expect, it } from "vitest";

import { buildControlUiCommand, buildReleaseCommand, buildRuntimePath, findRunningWatcherPids, prefixLines } from "./run-release-foreground.mjs";

describe("foreground release supervisor", () => {
  it("prefixes complete lines and preserves a partial line for the next chunk", () => {
    expect(prefixLines("step 1\nstep", "release")).toEqual({
      output: "[release] step 1\n",
      remainder: "step",
    });
    expect(prefixLines(" 2\n", "release", "step")).toEqual({
      output: "[release] step 2\n",
      remainder: "",
    });
  });

  it("passes resume arguments through npm without changing the release script", () => {
    expect(buildReleaseCommand("release", ["--resume"])).toEqual(["run", "release", "--", "--resume"]);
    expect(buildReleaseCommand("release:daily", [])).toEqual(["run", "release:daily"]);
  });

  it("supports the internal release implementation used by the public command", () => {
    expect(buildReleaseCommand("release:core", ["--resume"])).toEqual(["run", "release:core", "--", "--resume"]);
  });

  it("keeps the Node runtime discoverable for npm child processes", () => {
    const runtimePath = buildRuntimePath("/custom/bin:/usr/bin");
    expect(runtimePath.split(":")).toContain("/usr/local/bin");
    expect(runtimePath.split(":")).toContain("/custom/bin");
  });

  it("ensures the control UI is part of the default supervisor path", () => {
    expect(buildControlUiCommand(4188).slice(1)).toEqual(["--ensure", "--open", "--port", "4188"]);
  });

  it("reuses an existing watcher instead of spawning duplicate retry processes", () => {
    const table = [
      "16180 node /workspace/scripts/realtime-release-watcher.mjs",
      "16181 node /workspace/scripts/run-release-foreground.mjs",
      "16182 rg realtime-release-watcher.mjs",
    ].join("\n");
    expect(findRunningWatcherPids(table, 16181)).toEqual([16180]);
  });
});
