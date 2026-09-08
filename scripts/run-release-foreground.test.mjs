// @vitest-environment node

import { describe, expect, it } from "vitest";

import { buildReleaseCommand, prefixLines } from "./run-release-foreground.mjs";

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
}); 
