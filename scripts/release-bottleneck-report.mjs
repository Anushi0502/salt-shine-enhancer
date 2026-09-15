import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const MINUTE_MS = 60_000;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function measuredDuration(value) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

export function classifyReleaseBottleneck(step = {}) {
  const text = `${normalize(step.label)} ${normalize(step.command)} ${normalize(step.args?.join?.(" "))}`;
  if (/build|theme|artifact/.test(text)) {
    return "build";
  }
  if (/seo|metafield|publication|sync|shopify|collection|price|variant|shuffle|live/.test(text)) {
    return "shopify-io";
  }
  if (/vision|taxonomy|knowledge|classification|image|model/.test(text)) {
    return "local-model";
  }
  if (/verify|validate|readback|audit|reconcile/.test(text)) {
    return "verification";
  }
  return "orchestration";
}

export function recommendReleaseOptimization(step = {}) {
  const text = `${normalize(step.label)} ${normalize(step.command)} ${normalize(step.args?.join?.(" "))}`;
  if (/seo/.test(text)) {
    return "Reuse the verified live catalog and use bounded shared-client readback workers; avoid duplicate product reads.";
  }
  if (/merge/.test(text)) {
    return "Use checkpointed bounded mutation workers, batch verification, and resume only pending product IDs.";
  }
  if (/sync|refresh/.test(text)) {
    return "Reuse the shared release snapshot and complete cache, and overlap independent feeds while keeping membership reads live when required.";
  }
  if (/metafield|backfill/.test(text)) {
    return "Use bulk writes first and bounded fallback reads through the shared scheduler; checkpoint each batch.";
  }
  if (/collection/.test(text)) {
    return "Use one bulk membership export and targeted retries only for unresolved products; preserve rule semantics.";
  }
  if (/publication/.test(text)) {
    return "Batch publication mutations with bounded concurrency and exact live readback.";
  }
  if (/price|variant/.test(text)) {
    return "Reuse the complete variant map, process cost bands in bounded batches, and read back only changed variants.";
  }
  if (/vision|taxonomy|knowledge|classification|image|model/.test(text)) {
    return "Reuse fingerprinted local artifacts and keep MLX/Metal inference bounded by memory while batching CPU preparation.";
  }
  if (/build|theme|artifact/.test(text)) {
    return "Avoid duplicate artifact generation and reserve memory for the single production build.";
  }
  return "Keep stage checkpoints and telemetry enabled; parallelize only independent work.";
}

function statusForDuration(durationMs, thresholdMs, rank, currentStepIndex, stepIndex) {
  if (durationMs === null) {
    return stepIndex < currentStepIndex ? "reused-unmeasured" : "pending";
  }
  if (durationMs >= 15 * MINUTE_MS) return "critical";
  if (durationMs >= thresholdMs || rank <= 8) return "bottleneck";
  return "normal";
}

export function buildReleaseBottleneckReport({
  steps = [],
  completedSteps = [],
  releaseState = {},
  generatedAt = new Date().toISOString(),
} = {}) {
  const completedByIndex = new Map(
    (Array.isArray(completedSteps) ? completedSteps : [])
      .map((entry) => [Number(entry?.index || 0), entry])
      .filter(([index]) => Number.isInteger(index) && index > 0),
  );
  const durations = [...completedByIndex.values()]
    .map((entry) => measuredDuration(entry?.durationMs))
    .filter((duration) => duration !== null);
  const measuredDurationMs = durations.reduce((total, duration) => total + duration, 0);
  const thresholdMs = Math.max(MINUTE_MS, measuredDurationMs * 0.05);
  const rankedIndexes = [...completedByIndex.entries()]
    .filter(([, entry]) => measuredDuration(entry?.durationMs) !== null)
    .sort(([, left], [, right]) => measuredDuration(right.durationMs) - measuredDuration(left.durationMs))
    .map(([index]) => index);
  const rankByIndex = new Map(rankedIndexes.map((index, rank) => [index, rank + 1]));
  const currentStepIndex = Number(releaseState?.stepIndex || releaseState?.completedStepIndex || 0);

  const rows = (Array.isArray(steps) ? steps : []).map((step, offset) => {
    const index = offset + 1;
    const entry = completedByIndex.get(index);
    const durationMs = measuredDuration(entry?.durationMs);
    const rank = rankByIndex.get(index) || null;
    return {
      index,
      label: String(step?.label || entry?.label || `Step ${index}`),
      command: String(step?.command || ""),
      category: classifyReleaseBottleneck(step),
      durationMs,
      durationMinutes: durationMs === null ? null : Number((durationMs / MINUTE_MS).toFixed(2)),
      sharePercent: durationMs === null || measuredDurationMs === 0
        ? null
        : Number(((durationMs / measuredDurationMs) * 100).toFixed(2)),
      rank,
      status: statusForDuration(durationMs, thresholdMs, rank || Number.MAX_SAFE_INTEGER, currentStepIndex, index),
      recommendation: recommendReleaseOptimization(step),
      completedAt: String(entry?.completedAt || ""),
    };
  });

  const topBottlenecks = rows
    .filter((row) => row.durationMs !== null)
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 8)
    .map((row) => ({
      index: row.index,
      label: row.label,
      category: row.category,
      durationMs: row.durationMs,
      durationMinutes: row.durationMinutes,
      sharePercent: row.sharePercent,
      status: row.status,
      recommendation: row.recommendation,
    }));

  return {
    schemaVersion: 1,
    generatedAt,
    profile: String(releaseState?.profile || ""),
    releaseStatus: String(releaseState?.status || "unknown"),
    currentStepIndex,
    totalSteps: rows.length,
    measuredStepCount: durations.length,
    measuredDurationMs,
    measuredDurationMinutes: Number((measuredDurationMs / MINUTE_MS).toFixed(2)),
    bottleneckThresholdMs: Math.round(thresholdMs),
    topBottlenecks,
    steps: rows,
  };
}

function formatMarkdown(report) {
  const lines = [
    "# SALT Release Bottleneck Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Profile: ${report.profile || "unknown"}`,
    `Status: ${report.releaseStatus}`,
    `Measured: ${report.measuredStepCount}/${report.totalSteps} steps (${report.measuredDurationMinutes} minutes)`,
    `Bottleneck threshold: ${Number(report.bottleneckThresholdMs / MINUTE_MS).toFixed(2)} minutes`,
    "",
    "## Top Bottlenecks",
    "",
    "| Step | Category | Duration | Share | Status |",
    "| ---: | --- | ---: | ---: | --- |",
  ];
  for (const row of report.topBottlenecks) {
    lines.push(
      `| ${row.index} | ${row.category} | ${row.durationMinutes} min | ${row.sharePercent ?? "-"}% | ${row.status} |`,
    );
    lines.push(`  Recommendation: ${row.recommendation}`);
  }
  lines.push("", "## All Steps", "", "| Step | Label | Duration | Status |", "| ---: | --- | ---: | --- |");
  for (const row of report.steps) {
    lines.push(`| ${row.index} | ${row.label.replaceAll("|", "\\|")} | ${row.durationMinutes ?? "-"} min | ${row.status} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function writeAtomic(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, contents, "utf8");
  await rename(tempPath, path);
}

export async function writeReleaseBottleneckReport({
  steps,
  completedSteps,
  releaseState,
  outputDir = resolve(process.cwd(), "output"),
} = {}) {
  const report = buildReleaseBottleneckReport({ steps, completedSteps, releaseState });
  await Promise.all([
    writeAtomic(resolve(outputDir, "release-bottleneck-report.json"), `${JSON.stringify(report, null, 2)}\n`),
    writeAtomic(resolve(outputDir, "release-bottleneck-report.md"), formatMarkdown(report)),
  ]);
  return report;
}
