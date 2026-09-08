// The shard floor below adds 8 GB of working headroom. Keep a practical
// baseline so a configured 6 GB shard can recover on machines with 18 GB free.
const DEFAULT_MIN_FREE_BYTES = 18_000_000_000;
const DEFAULT_HEAD_ONLY_MIN_FREE_BYTES = 8_000_000_000;

function positiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function evaluateVisualTrainingAdmission({
  autoStart = true,
  releaseActive = false,
  allowDuringRelease = false,
  trainingActive = false,
  configExists = false,
  modelExists = false,
  availableBytes = 0,
  minFreeBytes = DEFAULT_MIN_FREE_BYTES,
  requiredFreeBytes = null,
  maxShardBytes = 25_000_000_000,
  headOnlyReady = false,
  headOnlyMinFreeBytes = DEFAULT_HEAD_ONLY_MIN_FREE_BYTES,
  retryAt = "",
  now = Date.now(),
} = {}) {
  const available = positiveNumber(availableBytes);
  const shardFloor = positiveNumber(maxShardBytes, 25_000_000_000) + 8 * 1024 ** 3;
  const explicitRequired = positiveNumber(requiredFreeBytes, 0);
  const headOnlyFloor = Math.max(
    DEFAULT_HEAD_ONLY_MIN_FREE_BYTES,
    positiveNumber(headOnlyMinFreeBytes, DEFAULT_HEAD_ONLY_MIN_FREE_BYTES),
  );
  const required = headOnlyReady
    ? headOnlyFloor
    : explicitRequired > 0
      ? Math.max(shardFloor, explicitRequired)
      : Math.max(DEFAULT_MIN_FREE_BYTES, positiveNumber(minFreeBytes, DEFAULT_MIN_FREE_BYTES), shardFloor);
  const retryTimestamp = Date.parse(String(retryAt || ""));
  if (!autoStart) return { shouldStart: false, status: "disabled", reason: "automatic visual training is disabled" };
  if (releaseActive && !allowDuringRelease) {
    return { shouldStart: false, status: "deferred", reason: "an active release owns the worker" };
  }
  if (trainingActive) return { shouldStart: false, status: "running", reason: "visual training worker is already running" };
  if (modelExists) return { shouldStart: false, status: "verified", reason: "a visual taxonomy model is already installed" };
  if (!configExists) return { shouldStart: false, status: "blocked", reason: "visual taxonomy training config is missing" };
  if (Number.isFinite(retryTimestamp) && retryTimestamp > now) {
    return { shouldStart: false, status: "retry-backoff", reason: "the previous visual training attempt is in retry backoff", retryAt };
  }
  if (available < required) {
    return {
      shouldStart: false,
      status: "blocked",
      reason: `insufficient free space for ${headOnlyReady ? "resumable head training" : `the configured ${Math.round(positiveNumber(maxShardBytes, 25_000_000_000) / 1_000_000_000)} GB shard plus headroom`} (${available} < ${required} bytes)`,
      availableBytes: available,
      requiredFreeBytes: required,
    };
  }
  return {
    shouldStart: true,
    status: releaseActive ? "admitted-parallel" : "admitted",
    reason: releaseActive
      ? `${headOnlyReady ? "resumable head" : "parallel"} training is explicitly enabled, inputs are configured, and disk headroom is sufficient`
      : `${headOnlyReady ? "resumable head" : "full"} training inputs are configured and disk headroom is sufficient`,
    availableBytes: available,
    requiredFreeBytes: required,
  };
}

export { DEFAULT_HEAD_ONLY_MIN_FREE_BYTES, DEFAULT_MIN_FREE_BYTES };
