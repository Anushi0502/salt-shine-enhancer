#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function submitGptSeoBatchWithAppleScript({
  inputPath,
  promptPath,
  responsePath,
  scriptPath,
  requestId = "",
}) {
  const { stdout } = await execFileAsync(
    "osascript",
    [scriptPath, inputPath, promptPath, responsePath, requestId],
    { maxBuffer: 2 * 1024 * 1024, timeout: 30_000 },
  );
  const result = String(stdout || "").trim();
  if (!result.startsWith("submitted:")) {
    throw new Error(`ChatGPT AppleScript bridge did not confirm submission: ${result || "no output"}`);
  }
  return result;
}
