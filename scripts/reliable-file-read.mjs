import { readFile as fsReadFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const defaultAttempts = Math.max(2, Math.min(10, Number(process.env.SALT_FILE_READ_ATTEMPTS || 8)));

export function isTransientFileReadError(error) {
  return new Set(["EAGAIN", "EBUSY", "EMFILE", "ENFILE"]).has(String(error?.code || ""))
    || Number(error?.errno) === -11
    || /Unknown system error -11.*read/i.test(String(error?.message || error || ""));
}

export async function readFileWithRetry(path, options, attempts = defaultAttempts) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fsReadFile(path, options);
    } catch (error) {
      lastError = error;
      if (!isTransientFileReadError(error) || attempt === attempts - 1) throw error;
      await sleep(Math.min(2_000, 100 * 2 ** attempt));
    }
  }
  throw lastError;
}
