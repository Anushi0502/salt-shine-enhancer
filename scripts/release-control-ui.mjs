#!/usr/bin/env node

import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { buildProcessTerminationTargets, parseProcessTable } from "./lib/process-runtime.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const releaseStatePath = resolve(outputDir, "release-run-state.json");
const watcherStatePath = resolve(outputDir, "realtime-release-watcher-state.json");
const visualTrainingStatusPath = resolve(outputDir, "visual-taxonomy-training-status.json");
const visualShardTrainingStatePath = resolve(outputDir, "visual-taxonomy-shard-training-state.json");
const visualTaxonomyModelPath = resolve(process.env.SALT_VISUAL_TAXONOMY_MODEL_PATH || resolve(outputDir, "visual-taxonomy-model.json"));
const gptSeoProgressPath = resolve(outputDir, "gpt-seo-enrichment.json");
const gptSeoQueueDir = resolve(outputDir, "gpt-seo-applescript");
const logPath = resolve(outputDir, "release-control-ui.log");
const watcherLogPath = resolve(outputDir, "realtime-release-watcher.log");
const supervisorPath = resolve(rootDir, "scripts", "run-release-foreground.mjs");
const nativeSourcePath = resolve(rootDir, "scripts", "release-control-ui.macos.swift");
const nativeAppPath = resolve(outputDir, "SALT Release Control.app");
const nativeBinaryPath = resolve(nativeAppPath, "Contents", "MacOS", "SALTReleaseControl");
const nativeInfoPath = resolve(nativeAppPath, "Contents", "Info.plist");
const configuredPort = Number(process.env.SALT_RELEASE_UI_PORT || 4177);
const defaultPort = Number.isInteger(configuredPort) ? Math.max(1024, Math.min(65535, configuredPort)) : 4177;
const maxLogChars = 120_000;
const execFileAsync = promisify(execFile);
let activeChild = null;
let visualShardProgressCache = { path: "", mtimeMs: 0, summary: null };

const HTML = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SALT Release Control</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; background: #f5f5f7; color: #1d1d1f; }
    @media (prefers-color-scheme: dark) { :root { background: #171719; color: #f5f5f7; } .card, pre { background: #242426; border-color: #3a3a3c; } select, button { background: #2c2c2e; color: #f5f5f7; border-color: #545458; } .muted { color: #b2b2b7; } }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 80% -20%, rgba(0,122,255,.16), transparent 38%), var(--page, #f5f5f7); }
    main { width: min(1080px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    .eyebrow { margin: 0 0 8px; color: #0071e3; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(30px, 6vw, 52px); letter-spacing: -.045em; line-height: 1; }
    .subtitle { max-width: 700px; margin: 14px 0 26px; color: #6e6e73; font-size: 16px; line-height: 1.5; }
    .grid { display: grid; grid-template-columns: minmax(420px, .9fr) minmax(0, 1.1fr); gap: 16px; align-items: start; }
    .left-rail { display: grid; gap: 16px; align-content: start; min-width: 0; }
    .log-card { min-width: 0; }
    .card { border: 1px solid #d2d2d7; border-radius: 22px; background: rgba(255,255,255,.86); box-shadow: 0 18px 48px rgba(0,0,0,.08); padding: 22px; }
    h2 { margin: 0 0 18px; font-size: 20px; letter-spacing: -.02em; }
    .fields { display: grid; gap: 14px; }
    label { display: grid; gap: 7px; font-size: 13px; font-weight: 650; }
    select, button { min-height: 44px; border: 1px solid #c7c7cc; border-radius: 12px; padding: 0 13px; font: inherit; }
    select { background: #fff; color: inherit; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    button { cursor: pointer; font-weight: 700; }
    button.primary { border-color: #0071e3; background: #0071e3; color: #fff; }
    button.secondary { background: transparent; }
    button.danger { border-color: #ff3b30; background: #ff3b30; color: #fff; }
    button:disabled { cursor: not-allowed; opacity: .5; }
    .notice { margin: 16px 0 0; border-radius: 12px; background: rgba(0,113,227,.1); padding: 11px 13px; color: #005bb5; font-size: 13px; line-height: 1.4; }
    .unified-pill { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid rgba(0,113,227,.22); border-radius: 14px; background: linear-gradient(135deg, rgba(0,113,227,.12), rgba(52,199,89,.08)); padding: 13px 14px; }
    .unified-pill strong { display: block; font-size: 14px; }
    .unified-pill span { display: block; margin-top: 3px; color: #6e6e73; font-size: 12px; }
    .unified-pill b { flex: 0 0 auto; border-radius: 999px; background: rgba(52,199,89,.14); padding: 6px 9px; color: #16803c; font-size: 11px; }
    .status-line { display: flex; align-items: center; gap: 10px; min-height: 28px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #8e8e93; }
    .dot.running { background: #34c759; box-shadow: 0 0 0 5px rgba(52,199,89,.14); }
    .dot.failed { background: #ff3b30; }
    .dot.waiting_for_network { background: #ff9f0a; }
    .status-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 7px; color: #6e6e73; font-size: 12px; }
    .status-meta span { border-radius: 999px; background: rgba(118,118,128,.12); padding: 5px 9px; }
    .checkpoint-note { margin: 12px 0 0; border-left: 3px solid #0071e3; border-radius: 8px; background: rgba(0,113,227,.08); padding: 9px 11px; color: #005bb5; font-size: 13px; line-height: 1.4; }
    .gpt-progress { margin: 12px 0 0; border-left: 3px solid #af52de; border-radius: 8px; background: rgba(175,82,222,.1); padding: 9px 11px; color: #8e44ad; font-size: 13px; line-height: 1.4; }
    .release-summary { display: grid; gap: 11px; margin: 0 0 12px; border: 1px solid rgba(0,113,227,.2); border-radius: 15px; background: linear-gradient(135deg, rgba(0,113,227,.1), rgba(118,118,128,.08)); padding: 13px 14px; }
    .release-summary-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .release-summary-status { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .release-summary-status strong { overflow-wrap: anywhere; }
    .release-summary-dot { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: #8e8e93; }
    .release-summary-dot.running { background: #34c759; box-shadow: 0 0 0 4px rgba(52,199,89,.14); }
    .release-summary-dot.failed { background: #ff3b30; }
    .release-summary-dot.waiting_for_network { background: #ff9f0a; }
    .release-freshness { color: #6e6e73; font-size: 11px; text-align: right; }
    .release-activity { display: grid; gap: 3px; }
    .release-activity span, .release-summary-meta span { color: #6e6e73; font-size: 11px; }
    .release-activity strong { font-size: 14px; line-height: 1.35; overflow-wrap: anywhere; }
    .release-summary-meta { display: flex; flex-wrap: wrap; gap: 7px; }
    .release-summary-meta span { border-radius: 999px; background: rgba(118,118,128,.12); padding: 5px 8px; }
    .release-summary-error { margin: 0; border-left: 3px solid #ff3b30; border-radius: 7px; background: rgba(255,59,48,.1); padding: 8px 10px; color: #c9342b; font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
    .metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 16px 0; }
    .metric:nth-child(3) { grid-column: 1 / -1; }
    .metric { border-radius: 13px; background: rgba(118,118,128,.12); padding: 12px; }
    .metric strong { display: block; font-size: 20px; line-height: 1.15; overflow-wrap: anywhere; }
    .metric span { display: block; margin-top: 4px; color: #6e6e73; font-size: 11px; }
    .log-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 34px; margin: 0 0 8px; }
    .log-toolbar button { min-height: 34px; padding: 0 11px; font-size: 12px; }
    pre { max-height: 540px; min-height: 320px; overflow: auto; margin: 0; border: 1px solid #d2d2d7; border-radius: 14px; background: #1d1d1f; color: #f5f5f7; padding: 14px; font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
    .muted { color: #6e6e73; font-size: 12px; }
    @media (max-width: 760px) { main { width: min(100% - 20px, 560px); padding-top: 22px; } .grid { grid-template-columns: 1fr; } .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .card { border-radius: 17px; padding: 17px; } }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">SALT Operations</p>
    <h1>Release control</h1>
    <p class="subtitle">Start a guarded catalog release and watch the same checkpoint, retry, and watcher stream used by the foreground supervisor.</p>
    <div class="grid">
      <div class="left-rail">
      <section class="card" aria-label="Release controls">
        <div class="unified-pill"><div><strong>Unified catalog workflow</strong><span>Full catalog and daily scheduling share the same guarded graph.</span></div><b>CONNECTED</b></div>
        <div class="fields">
          <label for="seo-mode">SEO mode
            <select id="seo-mode"><option value="gpt">GPT SEO</option><option value="deterministic">Normal SEO</option></select>
          </label>
          <label for="seo-scope">SEO scope
            <select id="seo-scope"><option value="all-products">All active products</option><option value="new-products">New products only</option></select>
          </label>
        </div>
        <p class="notice" id="seo-notice" role="note">GPT SEO uses product-centered protected batches of 500; GPT-written fields are never overwritten by normal SEO backfills. Resume always uses the saved checkpoint mode and scope.</p>
        <div class="actions">
          <button class="primary" id="start">Start release</button>
          <button class="secondary" id="resume">Resume checkpoint</button>
          <button class="danger" id="stop" disabled>Stop release</button>
        </div>
        <p class="muted" id="message" aria-live="polite">Ready. This panel listens on localhost only.</p>
      </section>
      <section class="card status-card" aria-labelledby="status-heading">
        <h2 id="status-heading">Live status</h2>
        <div class="status-line"><span class="dot" id="dot" aria-hidden="true"></span><strong id="status">unknown</strong></div>
        <div class="status-meta"><span id="watcher">Watcher: unknown</span><span id="model">Metal model: unknown</span><span id="workflow">Workflow: unified catalog</span></div>
        <p class="muted" id="step">No checkpoint loaded.</p>
          <p class="checkpoint-note" id="checkpoint" role="status" aria-live="polite">Checkpoint state is loading.</p>
          <p class="muted" id="model-detail" aria-live="polite"></p>
          <p class="gpt-progress" id="gpt-progress" role="status" aria-live="polite" hidden></p>
        <div class="metrics"><div class="metric"><strong id="index">-</strong><span>step</span></div><div class="metric"><strong id="pid">-</strong><span>release PID</span></div><div class="metric"><strong id="heartbeat">-</strong><span>heartbeat</span></div></div>
      </section>
      </div>
      <section class="card log-card" aria-labelledby="log-heading">
        <h2 id="log-heading">Release log</h2>
        <div class="release-summary" role="status" aria-live="polite">
          <div class="release-summary-head"><div class="release-summary-status"><span class="release-summary-dot" id="log-state-dot" aria-hidden="true"></span><strong id="log-state">Checking release state...</strong></div><span class="release-freshness" id="log-freshness">Waiting for heartbeat</span></div>
          <div class="release-activity"><span>Current operation</span><strong id="release-activity">Loading current operation...</strong><span class="gpt-progress" id="release-gpt-progress" role="status" aria-live="polite" hidden></span></div>
          <div class="release-summary-meta"><span id="release-step-meta">Step -</span><span id="release-heartbeat-meta">Heartbeat -</span><span id="release-sync-meta">State source -</span></div>
          <p class="release-summary-error" id="release-error" hidden></p>
        </div>
        <div class="log-toolbar"><button class="secondary" id="show-earlier" type="button" aria-controls="log" hidden>Show earlier</button><span class="muted" id="log-count">Showing latest 15 messages</span></div>
        <pre id="log" aria-label="Release log" aria-live="polite">Loading release log...</pre>
      </section>
    </div>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    const mode = $('seo-mode');
    const scope = $('seo-scope');
    const message = $('message');
    const logPageSize = 15;
    let selectionTouched = false;
    let logLines = [];
    let logStart = 0;
    let logLoaded = false;
    let logFollowLatest = true;
    function formatModelStatus(training) {
      const status = String(training?.status || 'unknown').trim().toLowerCase();
      const lifecycle = training?.lifecycle || {};
      if (lifecycle.mode === 'frozen-final' && lifecycle.retrainPolicy === 'manual-only') {
        return { label: 'frozen final', detail: 'Visual model is finalized; automatic retraining is disabled.' };
      }
      const details = String(training?.reason || training?.error || '').trim();
      const lines = details.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const detail = lines.find((line) => /taxonomy|retrain|incompatible|metal model/i.test(line) && !/^command failed:/i.test(line)) || lines[0] || '';
      const needsRetraining = ['failed', 'blocked'].includes(status) && /taxonomy mismatch|retrain|incompatible|stale/i.test(details);
      return { label: needsRetraining ? 'retrain required' : status, detail: detail.replace(/^Error:\s*/i, '') };
    }
    function formatShardProgress(shard) {
      const phase = String(shard?.phase || '').trim();
      const current = String(shard?.currentShard || '').trim();
      const progress = shard?.currentProgress || {};
      const completed = Number(progress.completedImages || progress.recordsWritten || progress.entriesProcessed || progress.imagesProcessed || 0);
      const total = Number(progress.totalImages || progress.totalRecords || progress.totalEntries || 0);
      const steps = Number(progress.steps || 0);
      const totalSteps = Number(progress.totalSteps || 0);
      const shardCount = Number(shard?.shardCount || Math.max(
        Object.keys(shard?.adapterShards || {}).length,
        Object.keys(shard?.embeddingShards || {}).length,
      ));
      const adapterDone = Object.values(shard?.adapterShards || {}).filter((entry) => entry?.status === 'purged').length;
      const entryText = completed > 0 && total > 0 ? ' - ' + completed + '/' + total + ' entries' : '';
      if (phase === 'complete') return 'All visual shards complete; final model verification is pending.';
      if (phase === 'embedding-encoding' && current && total > 0) {
        return 'Embedding pass - shard ' + current + (shardCount ? '/' + shardCount : '') + ' - ' + completed + '/' + total + ' images - adapter training ' + adapterDone + '/' + (shardCount || adapterDone) + ' complete';
      }
      if (current && totalSteps > 0) return 'Shard ' + current + (shardCount ? '/' + shardCount : '') + ' - ' + (phase || 'running') + ' - ' + steps + '/' + totalSteps + ' steps' + entryText;
      if (current && total > 0) return 'Shard ' + current + (shardCount ? '/' + shardCount : '') + ' - ' + (phase || 'running') + ' - ' + completed + '/' + total + ' images';
      if (current) return 'Shard ' + current + ' - ' + (phase || 'running');
      return phase ? 'Visual training - ' + phase : '';
    }
    function formatLocalTime(value) {
      if (!value) return '-';
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? '-' : date.toLocaleTimeString();
    }
    function formatHeartbeatAge(value) {
      if (!value) return 'No heartbeat';
      const timestamp = new Date(value).getTime();
      if (!Number.isFinite(timestamp)) return 'Heartbeat unavailable';
      const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
      if (seconds < 60) return 'Updated ' + seconds + 's ago';
      const minutes = Math.floor(seconds / 60);
      return 'Updated ' + minutes + 'm ago';
    }
    function formatGptSeoProgress(progress) {
      if (!progress || !Number(progress.total)) return '';
      return String(progress.message || '').trim();
    }
    function updateSeoNotice() {
      $('seo-notice').textContent = mode.value === 'gpt'
        ? 'GPT SEO uses product-centered protected batches of 500; GPT-written fields are never overwritten by normal SEO backfills. Resume always uses the saved checkpoint mode and scope.'
        : 'Normal SEO uses the deterministic catalog rules. It never overwrites fields protected by a completed GPT SEO record.';
    }
    function updateReleaseSummary(run, state, active, gptProgress) {
      const status = String(run?.status || 'unknown').trim().toLowerCase();
      const statusLabel = status === 'waiting_for_network' ? 'Waiting for network' : status.charAt(0).toUpperCase() + status.slice(1);
      const step = run?.stepIndex ? (run.stepIndex + '/' + (run.totalSteps || '?')) : '-';
      const activity = run?.stepLabel || run?.stageLabel || (active ? 'Release is starting...' : 'No active release');
      const heartbeat = run?.heartbeatAt || run?.stageLastActivityAt || run?.stageLastOutputAt || '';
      const errorText = String(run?.error || run?.stageError || run?.stageStderr || run?.lastError || '').trim();
      const errorLines = errorText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const error = errorLines.find((line) => /release stopped|catalog integrity|failed|error:/i.test(line)) || errorLines[0] || '';
      $('log-state').textContent = statusLabel;
      $('log-state-dot').className = 'release-summary-dot ' + status;
      $('release-activity').textContent = activity;
      const gptMessage = formatGptSeoProgress(gptProgress);
      $('release-gpt-progress').textContent = gptMessage;
      $('release-gpt-progress').hidden = !gptMessage;
      $('release-step-meta').textContent = 'Step ' + step;
      $('release-heartbeat-meta').textContent = 'Heartbeat ' + formatLocalTime(heartbeat);
      $('log-freshness').textContent = formatHeartbeatAge(heartbeat);
      $('release-sync-meta').textContent = 'State source ' + (state.releaseStateSource || 'release checkpoint');
      $('release-error').textContent = error;
      $('release-error').hidden = !error || !['failed', 'interrupted', 'waiting_for_network'].includes(status);
    }
    async function refresh() {
      try {
        const response = await fetch('/api/state?ts=' + Date.now(), { cache: 'no-store' });
        const state = await response.json();
        const run = state.release || {};
        const model = state.visualTaxonomyTraining || {};
        const shard = state.visualTaxonomyShardTraining || {};
        const gptProgress = state.gptSeoProgress || {};
        const modelView = formatModelStatus(model);
        const shardDetail = formatShardProgress(shard);
        const status = run.status || 'unknown';
        const seoMode = String(run.seoMode || 'unknown').toLowerCase();
        const active = Boolean(state.process?.active);
        updateReleaseSummary(run, state, active, gptProgress);
        $('status').textContent = status;
        $('dot').className = 'dot ' + status;
        $('watcher').textContent = 'Watcher: ' + (state.watcher?.processActive ? 'running' : 'stopped');
        $('release-sync-meta').textContent = 'Release state ' + (state.watcher?.releaseStatus || status || 'unknown');
        $('model').textContent = 'Metal model: ' + modelView.label;
        $('step').textContent = run.stepLabel ? (run.stepIndex || '?') + '/' + (run.totalSteps || '?') + ' ' + run.stepLabel : 'No checkpoint loaded.';
        $('checkpoint').textContent = active
          ? 'Release is running. The watcher and retry stream are connected.'
          : status === 'failed' || status === 'interrupted' || status === 'waiting_for_network'
            ? 'Release is stopped safely. Resume from the persisted checkpoint when the blocking gate is repaired.'
            : status === 'completed'
              ? 'Last release completed. A new run will use the same unified catalog graph.'
              : 'No active release process detected.';
        $('workflow').textContent = 'Workflow: ' + (seoMode === 'gpt' ? 'GPT SEO' : seoMode === 'deterministic' ? 'legacy deterministic' : 'SEO mode pending') + ' - ' + (run.seoScope === 'new-products' ? 'new products' : 'all products');
        $('model-detail').textContent = [modelView.detail ? ('Model gate: ' + modelView.detail) : '', shardDetail].filter(Boolean).join(' - ');
        const gptMessage = formatGptSeoProgress(gptProgress);
        $('gpt-progress').textContent = gptMessage;
        $('gpt-progress').hidden = !gptMessage;
        if (!selectionTouched && !active && ['gpt', 'deterministic'].includes(seoMode)) mode.value = seoMode;
        updateSeoNotice();
        $('index').textContent = run.stepIndex ? (run.stepIndex + '/' + (run.totalSteps || '?')) : '-';
        $('pid').textContent = active ? (state.process?.pid || run.pid || '-') : '-';
        $('heartbeat').textContent = run.heartbeatAt ? new Date(run.heartbeatAt).toLocaleTimeString() : '-';
        updateLog(state.log || 'No release output yet.');
        const resumable = ['failed', 'interrupted', 'paused', 'waiting_for_network'].includes(String(status).toLowerCase()) && Number(run.stepIndex || 0) > 0;
        $('resume').textContent = resumable ? 'Resume from step ' + run.stepIndex : 'Resume checkpoint';
        $('resume').setAttribute('aria-label', resumable ? 'Resume checkpoint from step ' + run.stepIndex : 'Resume checkpoint');
        $('start').disabled = active; $('resume').disabled = active; $('stop').disabled = !active;
        mode.disabled = active; scope.disabled = active;
        if (message.textContent.startsWith('State polling failed:')) message.textContent = 'Connected to the local release service.';
      } catch (error) { message.textContent = 'State polling failed: ' + error.message; }
    }
    function splitLog(value) {
      const lines = String(value || '').split(/\r?\n/);
      return lines.length > 1 && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
    }
    function renderLogWindow({ preserveScroll = false } = {}) {
      const element = $('log');
      const previousHeight = element.scrollHeight;
      const previousTop = element.scrollTop;
      element.textContent = logLines.slice(logStart).join('\n') || 'No release output yet.';
      $('show-earlier').hidden = logStart <= 0;
      $('log-count').textContent = logStart > 0 ? (logStart + ' earlier messages hidden') : 'Showing latest 15 messages';
      if (preserveScroll) element.scrollTop = element.scrollHeight - previousHeight + previousTop;
      else if (logFollowLatest) element.scrollTop = element.scrollHeight;
    }
    function updateLog(value) {
      const nextLines = splitLog(value);
      const appended = logLoaded && nextLines.length >= logLines.length && nextLines.slice(0, logLines.length).every((line, index) => line === logLines[index]);
      const previousLastPageStart = Math.max(0, logLines.length - logPageSize);
      const wasFollowingLatest = !logLoaded || logFollowLatest || logStart >= previousLastPageStart;
      const nextLastPageStart = Math.max(0, nextLines.length - logPageSize);
      if (!appended) {
        logStart = nextLastPageStart;
        logFollowLatest = true;
      } else if (wasFollowingLatest) {
        logStart = nextLastPageStart;
        logFollowLatest = true;
      } else {
        logStart = Math.min(logStart, nextLastPageStart);
      }
      logLines = nextLines;
      logLoaded = true;
      renderLogWindow();
    }
    async function start(resume) {
      message.textContent = resume ? 'Requesting guarded resume...' : 'Requesting guarded release...';
      try {
        const response = await fetch('/api/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: 'catalog', seoMode: mode.value, seoScope: scope.value, resume }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'start request failed');
        if (resume && payload.seoMode) {
          mode.value = payload.seoMode;
          selectionTouched = false;
          updateSeoNotice();
        }
        message.textContent = resume && payload.resumeFromStep
          ? 'Resuming from step ' + payload.resumeFromStep + ' in ' + String(payload.seoMode || mode.value).toUpperCase() + ' mode. Polling live output.'
          : 'Started supervisor PID ' + payload.pid + '. Polling live output.';
        await refresh();
      } catch (error) { message.textContent = error.message; }
    }
    async function stop() {
      if (!window.confirm('Stop the active release and preserve its checkpoint?')) return;
      message.textContent = 'Stopping release and preserving checkpoint...';
      try {
        const response = await fetch('/api/stop', { method: 'POST' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'stop request failed');
        message.textContent = 'Release stop requested. The checkpoint is being preserved.';
        await refresh();
      } catch (error) { message.textContent = error.message; }
    }
    $('start').addEventListener('click', () => start(false));
    $('resume').addEventListener('click', () => start(true));
    mode.addEventListener('change', () => { selectionTouched = true; updateSeoNotice(); });
    scope.addEventListener('change', () => { selectionTouched = true; });
    $('stop').addEventListener('click', stop);
    $('show-earlier').addEventListener('click', () => {
      if (logStart <= 0) return;
      logStart = Math.max(0, logStart - logPageSize);
      logFollowLatest = false;
      renderLogWindow({ preserveScroll: true });
    });
    refresh(); setInterval(refresh, 2000);
  </script>
</body>
</html>`;

async function readJsonIfPresent(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return { readError: error.message };
  }
}

async function readTail(path, limit = maxLogChars) {
  try {
    const value = await readFile(path, "utf8");
    return value.length > limit ? `... ${value.slice(-limit)}` : value;
  } catch (error) {
    return error?.code === "ENOENT" ? "" : `log read failed: ${error.message}`;
  }
}

export function compactReleaseLog(value) {
  const lines = String(value || "").split("\n");
  const compacted = [];
  let previousProgressKey = "";
  let previousProgressLine = "";
  let repeatCount = 0;

  const flushProgress = () => {
    if (!previousProgressLine) return;
    compacted.push(previousProgressLine);
    if (repeatCount > 1) compacted.push(`[ui] unchanged progress repeated ${repeatCount} times`);
    previousProgressKey = "";
    previousProgressLine = "";
    repeatCount = 0;
  };

  for (const line of lines) {
    const progressMatch = line.match(/(?:release active|release progress); step=.*$/i);
    if (!progressMatch) {
      flushProgress();
      compacted.push(line);
      continue;
    }
    const progressKey = progressMatch[0];
    if (progressKey === previousProgressKey) {
      repeatCount += 1;
      continue;
    }
    flushProgress();
    previousProgressKey = progressKey;
    previousProgressLine = line;
    repeatCount = 1;
  }
  flushProgress();
  return compacted.join("\n");
}

async function readOperationalLog(limit = maxLogChars) {
  const [releaseLog, watcherLog, releaseState] = await Promise.all([
    readTail(logPath, limit),
    readTail(watcherLogPath, limit),
    readJsonIfPresent(releaseStatePath),
  ]);
  const stateStatus = String(releaseState?.status || "").trim().toLowerCase();
  const stateStep = releaseState?.stepIndex ? `${releaseState.stepIndex}/${releaseState.totalSteps || "?"}` : "-";
  const stateLabel = String(releaseState?.stepLabel || releaseState?.stageLabel || "").trim() || "unknown";
  const stateLine = releaseState && !releaseState.readError
    ? `[release-state] ${stateStatus || "unknown"}; step=${stateStep}; ${stateLabel}; heartbeat=${releaseState.heartbeatAt || "-"}`
    : "";
  const error = releaseState && !releaseState.readError ? summarizeReleaseError(releaseState) : "";
  const errorLine = error ? `[release-error] ${error}` : "";
  return mergeOperationalLogs(releaseLog, watcherLog, stateLine, errorLine, limit);
}

export function mergeOperationalLogs(releaseLog = "", watcherLog = "", stateLine = "", errorLine = "", limit = maxLogChars) {
  const sharedLogHasWatcherEvents = /\[(?:watcher|watcher:error)\]/i.test(String(releaseLog));
  const watcherFallback = watcherLog && !sharedLogHasWatcherEvents ? `[watcher-daemon tail]\n${watcherLog}` : "";
  const sections = [releaseLog, watcherFallback, stateLine, errorLine].filter(Boolean);
  return compactReleaseLog(sections.join("\n\n")).slice(-limit);
}

async function controlUiAlreadyRunning(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 750);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/state`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function openControlUi(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd.exe" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const opener = spawn(command, args, { stdio: "ignore", detached: true });
  opener.unref();
}

async function fileMtime(path) {
  try {
    return (await stat(path)).mtimeMs;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}

async function readGptSeoProgress() {
  const checkpoint = await readJsonIfPresent(gptSeoProgressPath);
  if (!checkpoint || checkpoint.readError || typeof checkpoint !== "object") return null;
  const total = Number(checkpoint.total || 0);
  const processed = Number(checkpoint.processed || 0);
  const batchSize = Math.max(1, Number(checkpoint.batchSize || 500));
  if (!Number.isFinite(total) || total <= 0) return null;
  const batchCount = Math.max(1, Math.ceil(total / batchSize));
  const currentBatch = Math.min(batchCount, Math.floor(processed / batchSize) + 1);
  const inputPath = resolve(gptSeoQueueDir, `batch-${String(currentBatch).padStart(4, "0")}.input.json`);
  const responsePath = resolve(gptSeoQueueDir, `batch-${String(currentBatch).padStart(4, "0")}.response.json`);
  const [inputMtime, responseMtime] = await Promise.all([fileMtime(inputPath), fileMtime(responsePath)]);
  const pending = processed < total;
  const waitingForResponse = pending && inputMtime > responseMtime;
  const state = pending ? (waitingForResponse ? "awaiting-chatgpt" : "starting-batch") : "complete";
  const rejected = Number(checkpoint.rejected || 0);
  const message = pending
    ? `GPT SEO batch ${currentBatch}/${batchCount} - ${waitingForResponse ? "waiting for ChatGPT response" : "starting"}; ${processed.toLocaleString()}/${total.toLocaleString()} processed; ${Number(checkpoint.accepted || 0).toLocaleString()} accepted; ${rejected.toLocaleString()} queued for retry.`
    : `GPT SEO complete - ${total.toLocaleString()}/${total.toLocaleString()} processed; ${Number(checkpoint.accepted || 0).toLocaleString()} accepted; ${rejected.toLocaleString()} rejected.`;
  return {
    status: String(checkpoint.status || "checkpoint"),
    state,
    provider: String(checkpoint.provider || "applescript"),
    processed,
    total,
    accepted: Number(checkpoint.accepted || 0),
    rejected,
    batchSize,
    currentBatch,
    batchCount,
    generatedAt: String(checkpoint.generatedAt || ""),
    message,
  };
}

async function ensureNativeMacApp() {
  if (process.platform !== "darwin") return null;
  const sourceTime = await fileMtime(nativeSourcePath);
  const binaryTime = await fileMtime(nativeBinaryPath);
  await mkdir(resolve(nativeAppPath, "Contents", "MacOS"), { recursive: true });
  if (!binaryTime || sourceTime > binaryTime) {
    await execFileAsync("swiftc", [
      "-parse-as-library",
      "-O",
      nativeSourcePath,
      "-o",
      nativeBinaryPath,
      "-framework",
      "SwiftUI",
      "-framework",
      "Combine",
    ], { cwd: rootDir, maxBuffer: 20 * 1024 * 1024 });
  }
  if (!(await fileMtime(nativeInfoPath))) {
    await writeFile(nativeInfoPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleDisplayName</key><string>SALT Release Control</string>
<key>CFBundleExecutable</key><string>SALTReleaseControl</string>
<key>CFBundleIdentifier</key><string>com.salt.online-store.release-control</string>
<key>CFBundleName</key><string>SALT Release Control</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
`, "utf8");
  }
  return nativeAppPath;
}

async function openDesktopSurface(port, url) {
  if (process.platform === "darwin") {
    try {
      const appPath = await ensureNativeMacApp();
      const opener = spawn("open", ["-a", appPath, "--args", "--port", String(port)], { stdio: "ignore", detached: true });
      opener.unref();
      process.stdout.write(`SALT native macOS release app: ${appPath}\n`);
      return "macOS app";
    } catch (error) {
      process.stderr.write(`SALT native app unavailable; using localhost web fallback: ${error.message}\n`);
    }
  }
  openControlUi(url);
  return "website";
}

export function isProcessAlive(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch {
    return false;
  }
}

export function isActiveReleaseState(state = {}) {
  return ["running", "waiting_for_network"].includes(String(state?.status || "").trim().toLowerCase())
    && Number(state?.pid || 0) > 0;
}

export function isResumableReleaseCheckpoint(state = {}) {
  return ["failed", "interrupted", "paused", "waiting_for_network"].includes(String(state?.status || "").trim().toLowerCase())
    && Number(state?.stepIndex || 0) > 0;
}

export function summarizeReleaseError(release = {}) {
  const details = [release?.error, release?.stageError, release?.stageStderr, release?.lastError]
    .filter(Boolean)
    .join("\n");
  const line = details
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .find((value) => /release stopped|catalog integrity|failed|error:/i.test(value)) || "";
  return line.length > 320 ? `${line.slice(0, 317)}...` : line;
}

export function buildReleaseActivity(release = {}, { processActive = false } = {}) {
  const savedStatus = String(release?.status || "unknown").trim().toLowerCase();
  const status = savedStatus === "running" && !processActive ? "stale" : savedStatus;
  const step = release?.stepIndex ? `${release.stepIndex}/${release.totalSteps || "?"}` : "-";
  const activity = String(release?.stepLabel || release?.stageLabel || "").trim()
    || (status === "stale" ? "Release process is no longer running" : processActive ? "Release is starting..." : "No active release");
  const heartbeatAt = String(release?.heartbeatAt || release?.stageLastActivityAt || release?.stageLastOutputAt || "").trim();
  return {
    status,
    step,
    activity,
    heartbeatAt,
    error: summarizeReleaseError(release),
  };
}

export function formatGptSeoProgress(progress = {}) {
  if (!progress || !Number(progress.total)) return "";
  return String(progress.message || "").trim();
}

export function resolveReleaseStopPid({ release = {}, watcher = {}, activeChildPid = 0 } = {}) {
  const supervisorPid = Number(activeChildPid || 0);
  if (supervisorPid > 0) return supervisorPid;
  const releasePid = Number(release?.pid || 0);
  const detachedSupervisorPid = Number(watcher?.releaseSupervisorPid || 0);
  const detachedReleasePid = Number(watcher?.releaseSupervisorReleasePid || 0);
  if (releasePid > 0 && detachedSupervisorPid > 0 && detachedReleasePid === releasePid) return detachedSupervisorPid;
  return releasePid;
}

export function formatVisualTrainingStatus(training) {
  const status = String(training?.status || "unknown").trim().toLowerCase();
  const details = String(training?.reason || training?.error || "").trim();
  const detailLines = details.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const detail = detailLines.find((line) => /taxonomy|retrain|incompatible|metal model/i.test(line) && !/^command failed:/i.test(line)) || detailLines[0] || "";
  const needsRetraining = ["failed", "blocked"].includes(status) && /taxonomy mismatch|retrain|incompatible|stale/i.test(details);
  const lifecycle = training?.lifecycle || {};
  if (lifecycle.mode === "frozen-final" && lifecycle.retrainPolicy === "manual-only") {
    return { label: "frozen final", detail: "Visual model is finalized; automatic retraining is disabled." };
  }
  return {
    label: needsRetraining ? "retrain required" : status,
    detail: detail.replace(/^Error:\s*/i, ""),
  };
}

export function formatVisualShardProgress(shard) {
  const phase = String(shard?.phase || "").trim();
  const current = String(shard?.currentShard || "").trim();
  const progress = shard?.currentProgress && typeof shard.currentProgress === "object" ? shard.currentProgress : {};
  const completed = Number(progress.completedImages || progress.recordsWritten || progress.entriesProcessed || progress.imagesProcessed || 0);
  const total = Number(progress.totalImages || progress.totalRecords || progress.totalEntries || 0);
  const steps = Number(progress.steps || 0);
  const totalSteps = Number(progress.totalSteps || 0);
  const shardCount = Number(shard?.shardCount || Math.max(
    Object.keys(shard?.adapterShards || {}).length,
    Object.keys(shard?.embeddingShards || {}).length,
  ));
  const adapterDone = Object.values(shard?.adapterShards || {}).filter((entry) => entry?.status === "purged").length;
  const entryText = completed > 0 && total > 0 ? ` - ${completed}/${total} entries` : "";
  if (phase === "complete") return "All visual shards complete; final model verification is pending.";
  if (phase === "embedding-encoding" && current && total > 0) {
    return `Embedding pass - shard ${current}/${shardCount || current} - ${completed}/${total} images - adapter training ${adapterDone}/${shardCount || adapterDone} complete`;
  }
  if (current && totalSteps > 0) return `Shard ${current}${shardCount ? `/${shardCount}` : ""} - ${phase || "running"} - ${steps}/${totalSteps} steps${entryText}`;
  if (current && total > 0) return `Shard ${current}${shardCount ? `/${shardCount}` : ""} - ${phase || "running"} - ${completed}/${total} images`;
  if (current) return `Shard ${current} - ${phase || "running"}`;
  return phase ? `Visual training - ${phase}` : "";
}

export function paginateReleaseLog(value, start = null, pageSize = 15) {
  const lines = String(value || "").split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const sizeValue = Number(pageSize);
  const size = Number.isFinite(sizeValue) ? Math.max(1, Math.floor(sizeValue)) : 15;
  const lastPageStart = Math.max(0, lines.length - size);
  const requestedStart = start == null ? lastPageStart : Number(start);
  const safeStart = Number.isFinite(requestedStart)
    ? Math.min(Math.max(0, Math.floor(requestedStart)), lastPageStart)
    : lastPageStart;
  return {
    lines,
    start: safeStart,
    visible: lines.slice(safeStart).join("\n"),
    hasEarlier: safeStart > 0,
    hiddenCount: safeStart,
  };
}

async function readVisualShardTrainingState() {
  const state = await readJsonIfPresent(visualShardTrainingStatePath);
  if (!state || typeof state !== "object" || state.readError) return state;

  const progressPath = String(state.currentProgressPath || "").trim();
  if (!progressPath) return state;
  const progressMtime = await fileMtime(progressPath);
  if (!progressMtime) return state;
  if (visualShardProgressCache.path === progressPath && visualShardProgressCache.mtimeMs === progressMtime && visualShardProgressCache.summary) {
    return { ...state, currentProgress: visualShardProgressCache.summary };
  }

  const progress = await readJsonIfPresent(progressPath);
  if (!progress || typeof progress !== "object" || progress.readError) return state;
  const completedImages = progress.completed && typeof progress.completed === "object"
    ? Object.keys(progress.completed).length
    : Number(progress.completedImages || progress.recordsWritten || progress.entriesProcessed || progress.imagesProcessed || 0);
  const failedImages = progress.failed && typeof progress.failed === "object"
    ? Object.keys(progress.failed).length
    : Number(progress.failedImages || 0);
  const totalImages = Number(progress.totalImages || progress.totalRecords || progress.totalEntries || state.currentShardImageCount || 0);
  const recordsWritten = Number(progress.recordsWritten || 0);
  const steps = Number(progress.steps || progress.currentStep || 0);
  const totalSteps = Number(progress.totalSteps || 0);
  const summary = {
    completedImages: Number.isFinite(completedImages) ? completedImages : recordsWritten,
    failedImages: Number.isFinite(failedImages) ? failedImages : 0,
    totalImages: Number.isFinite(totalImages) ? totalImages : 0,
    steps: Number.isFinite(steps) ? steps : 0,
    totalSteps: Number.isFinite(totalSteps) ? totalSteps : 0,
    updatedAt: String(progress.updatedAt || state.updatedAt || "").trim(),
  };
  visualShardProgressCache = { path: progressPath, mtimeMs: progressMtime, summary };
  return { ...state, currentProgress: summary };
}

export function validateStartRequest(payload) {
  const request = payload && typeof payload === "object" ? payload : {};
  const requestedProfile = String(request.profile || "catalog").trim().toLowerCase();
  const seoMode = String(request.seoMode || "gpt").trim().toLowerCase();
  const seoScope = String(request.seoScope || "all-products").trim().toLowerCase();
  const hasResumeFromStep = request.resumeFromStep !== undefined && request.resumeFromStep !== null && request.resumeFromStep !== "";
  const resumeFromStep = hasResumeFromStep ? Number(request.resumeFromStep) : null;
  if (!["catalog", "daily"].includes(requestedProfile)) throw new Error("profile must be catalog or daily");
  if (!["deterministic", "gpt"].includes(seoMode)) throw new Error("seoMode must be gpt or deterministic");
  if (!["all-products", "new-products"].includes(seoScope)) throw new Error("seoScope must be all-products or new-products");
  if (hasResumeFromStep && (!Number.isInteger(resumeFromStep) || resumeFromStep <= 0)) {
    throw new Error("resumeFromStep must be a positive integer");
  }
  if (hasResumeFromStep && request.resume !== true) {
    throw new Error("resumeFromStep requires resume=true");
  }
  return {
    // The UI exposes one workflow. Keep accepting the legacy daily value for
    // old clients, but route it through the canonical full-catalog graph.
    profile: "catalog",
    seoMode,
    seoScope,
    resume: request.resume === true,
    ...(hasResumeFromStep ? { resumeFromStep } : {}),
  };
}

export function applyResumeCheckpointSelection(request, checkpoint = {}) {
  if (!request?.resume) return request;
  const checkpointMode = String(checkpoint?.seoMode || "").trim().toLowerCase();
  const checkpointScope = String(checkpoint?.seoScope || "").trim().toLowerCase();
  return {
    ...request,
    seoMode: ["gpt", "deterministic"].includes(checkpointMode) ? checkpointMode : request.seoMode,
    seoScope: ["all-products", "new-products"].includes(checkpointScope) ? checkpointScope : request.seoScope,
    resumeFromStep: Number(request.resumeFromStep || 0) > 0
      ? Number(request.resumeFromStep)
      : Number(checkpoint?.stepIndex || 0) > 0
        ? Number(checkpoint.stepIndex)
        : null,
  };
}

async function readState() {
  const [release, watcher, visualTaxonomyTraining, visualTaxonomyShardTraining, gptSeoProgress, log, visualTaxonomyModel] = await Promise.all([
    readJsonIfPresent(releaseStatePath),
    readJsonIfPresent(watcherStatePath),
    readJsonIfPresent(visualTrainingStatusPath),
    readVisualShardTrainingState(),
    readGptSeoProgress(),
    readOperationalLog(),
    readJsonIfPresent(visualTaxonomyModelPath),
  ]);
  const visualTaxonomyTrainingView = visualTaxonomyTraining && typeof visualTaxonomyTraining === "object" && !visualTaxonomyTraining.readError
    ? {
      ...visualTaxonomyTraining,
      ...(visualTaxonomyModel?.lifecycle ? { lifecycle: visualTaxonomyModel.lifecycle } : {}),
      ...(visualTaxonomyModel?.candidateOnly !== undefined ? { candidateOnly: visualTaxonomyModel.candidateOnly } : {}),
      ...(visualTaxonomyModel?.modelVersion ? { modelVersion: visualTaxonomyModel.modelVersion } : {}),
    }
    : visualTaxonomyTraining;
  const releaseStatus = String(release?.status || "").trim().toLowerCase();
  const persistedReleaseActive = isActiveReleaseState(release) && isProcessAlive(release?.pid);
  const liveProcess = Boolean(activeChild && activeChild.exitCode === null) || persistedReleaseActive;
  const watcherPid = Number(watcher?.watcherPid || 0);
  const watcherAlive = isProcessAlive(watcherPid);
  const watcherReleaseStatus = String(watcher?.releaseStatus || "").trim().toLowerCase();
  const stateSource = releaseStatus ? "release checkpoint" : watcherAlive ? "watcher heartbeat" : "no checkpoint";
  const gptSeoProgressView = gptSeoProgress && !liveProcess &&
    ["failed", "interrupted", "paused", "waiting_for_network"].includes(releaseStatus) &&
    gptSeoProgress.state === "starting-batch"
    ? {
      ...gptSeoProgress,
      state: "checkpoint-ready",
      message: `GPT SEO batch ${gptSeoProgress.currentBatch}/${gptSeoProgress.batchCount} ready on resume; ` +
        `${Number(gptSeoProgress.processed || 0).toLocaleString()}/${Number(gptSeoProgress.total || 0).toLocaleString()} processed; ` +
        `${Number(gptSeoProgress.accepted || 0).toLocaleString()} accepted; ` +
        `${Number(gptSeoProgress.rejected || 0).toLocaleString()} queued for retry.`,
    }
    : gptSeoProgress;
  const watcherView = watcher && typeof watcher === "object"
    ? {
      ...watcher,
      processActive: watcherAlive,
      // The release checkpoint is authoritative once it exists. A watcher
      // can remain alive briefly after a release exits and must not resurrect
      // a stale "running" status in the operator surface.
      releaseStatus: releaseStatus || (watcherAlive ? watcherReleaseStatus : "stopped"),
      releaseStatusSource: stateSource,
      releaseStatusMismatch: Boolean(releaseStatus && watcherReleaseStatus && releaseStatus !== watcherReleaseStatus),
      activeReleasePid: persistedReleaseActive ? Number(release.pid || 0) : 0,
    }
    : watcher;
  return {
    release,
    watcher: watcherView,
    releaseStateSource: stateSource,
    visualTaxonomyTraining: visualTaxonomyTrainingView,
    visualTaxonomyShardTraining,
    gptSeoProgress: gptSeoProgressView,
    log,
    process: {
      active: liveProcess,
      pid: activeChild?.pid || (persistedReleaseActive ? Number(release.pid) : 0),
    },
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(`${JSON.stringify(payload)}\n`);
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function writeJsonAtomic(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.tmp-ui-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function updateWatcherState(patch) {
  const current = await readJsonIfPresent(watcherStatePath);
  if (current?.readError) throw new Error(`watcher state is unreadable: ${current.readError}`);
  await writeJsonAtomic(watcherStatePath, { ...(current || {}), ...patch });
}

async function markInterruptedCheckpoint(expectedReleasePid, reason) {
  const current = await readJsonIfPresent(releaseStatePath);
  if (current?.readError || !isActiveReleaseState(current)) return current;
  if (expectedReleasePid > 0 && Number(current.pid || 0) !== expectedReleasePid) return current;
  const next = {
    ...current,
    status: "interrupted",
    interruptedAt: new Date().toISOString(),
    interruptedBy: "release-control-ui",
    interruptedReason: reason,
    activeReleasePid: 0,
    stageChildPid: 0,
    stageStatus: "interrupted",
  };
  await writeJsonAtomic(releaseStatePath, next);
  const profile = String(current.profile || "").trim().toLowerCase();
  if (["catalog", "daily", "products"].includes(profile)) {
    await writeJsonAtomic(resolve(outputDir, `release-run-state.${profile}.json`), next);
  }
  return next;
}

async function signalProcessTree(rootPid, signal) {
  const root = Number(rootPid);
  if (!Number.isInteger(root) || root <= 0 || root === process.pid) return [];
  let processTable = [];
  try {
    const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,ppid="], { maxBuffer: 4 * 1024 * 1024 });
    processTable = parseProcessTable(stdout);
  } catch {
    // The process-group signal below is still sufficient for detached runs.
  }
  const targets = buildProcessTerminationTargets(root, processTable, process.pid);
  try {
    process.kill(-root, signal);
  } catch {
    // Detached supervisors are process-group leaders on macOS; if the group
    // disappeared, the explicit tree targets below cover the race.
  }
  for (const pid of targets) {
    try {
      process.kill(pid, signal);
    } catch {
      // A child may have exited between the process table read and signaling.
    }
  }
  return targets;
}

async function waitForReleaseStop(rootPid, releasePid, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  let state = await readJsonIfPresent(releaseStatePath);
  while (Date.now() < deadline) {
    state = await readJsonIfPresent(releaseStatePath);
    const releaseStillActive = isActiveReleaseState(state) && isProcessAlive(state?.pid);
    if (!releaseStillActive && !isProcessAlive(rootPid)) return state;
    await sleep(250);
  }
  return state;
}

async function startRelease(payload) {
  const requested = validateStartRequest(payload);
  if (activeChild && activeChild.exitCode === null) throw new Error(`release supervisor already running as PID ${activeChild.pid}`);
  const current = await readJsonIfPresent(releaseStatePath);
  const currentPid = Number(current?.pid || 0);
  if (["running", "waiting_for_network"].includes(String(current?.status || "").toLowerCase()) && isProcessAlive(currentPid)) {
    throw new Error(`release is already running as PID ${currentPid}`);
  }
  if (requested.resume && !isResumableReleaseCheckpoint(current)) {
    throw new Error("No resumable release checkpoint with a saved step was found.");
  }
  const request = applyResumeCheckpointSelection(requested, current);
  await updateWatcherState({ manualStopReleasePid: 0, manualStopAt: "" });
  const args = [supervisorPath, "--profile", request.profile, "--seo-mode", request.seoMode, "--seo-scope", request.seoScope];
  if (request.resume) {
    args.push("--resume");
    if (request.resumeFromStep) args.push("--resume-from-step", String(request.resumeFromStep));
  }
  await mkdir(outputDir, { recursive: true });
  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      SALT_RELEASE_SEO_MODE: request.seoMode,
      SALT_RELEASE_SEO_SCOPE: request.seoScope,
      SALT_RELEASE_RESUME: request.resume ? "1" : "0",
      SALT_GPT_SEO_RESUME: request.resume ? "1" : "0",
      SALT_GPT_SEO_PROVIDER: "applescript",
      SALT_GPT_SEO_BATCH_SIZE: "500",
      SALT_VISUAL_ENCODER_BATCH_SIZE: "32",
      SALT_FOREGROUND_RELEASE_SCRIPT: "release:core",
      SALT_RELEASE_UI_STARTED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  activeChild = child;
  // `run-release-foreground.mjs` is the single writer for release and
  // watcher output. Drain the supervisor streams here without appending them
  // again, otherwise every line appears twice in the UI log.
  child.stdout.resume();
  child.stderr.resume();
  child.once("error", () => undefined);
  child.once("exit", (code, signal) => {
    if (activeChild === child) activeChild = null;
  });
  return { ...request, pid: child.pid };
}

async function stopRelease() {
  const [release, watcher] = await Promise.all([
    readJsonIfPresent(releaseStatePath),
    readJsonIfPresent(watcherStatePath),
  ]);
  const releasePid = Number(release?.pid || 0);
  const rootPid = resolveReleaseStopPid({ release, watcher, activeChildPid: activeChild?.pid || 0 });
  const releaseActive = isActiveReleaseState(release) && isProcessAlive(releasePid);
  if ((!releaseActive && !isProcessAlive(rootPid)) || rootPid <= 0) {
    throw new Error("no active release process was found");
  }

  const stoppedAt = new Date().toISOString();
  const marker = { manualStopReleasePid: releasePid || rootPid, manualStopAt: stoppedAt };
  await updateWatcherState(marker);
  await signalProcessTree(rootPid, "SIGTERM");
  let finalState = await waitForReleaseStop(rootPid, releasePid);
  if (isActiveReleaseState(finalState) && isProcessAlive(finalState?.pid)) {
    await signalProcessTree(rootPid, "SIGKILL");
    finalState = await waitForReleaseStop(rootPid, releasePid, 2_000);
  }
  if (isActiveReleaseState(finalState) && isProcessAlive(releasePid)) {
    await signalProcessTree(releasePid, "SIGKILL");
    finalState = await waitForReleaseStop(releasePid, releasePid, 2_000);
  }
  if (isActiveReleaseState(finalState) && Number(finalState?.pid || 0) === releasePid) {
    finalState = await markInterruptedCheckpoint(releasePid, "release stopped from the control UI");
  }
  // The watcher may have written its heartbeat during termination; write the
  // marker again so the stopped instance cannot be immediately relaunched.
  await updateWatcherState(marker);
  return {
    stopped: true,
    supervisorPid: rootPid,
    releasePid,
    status: String(finalState?.status || "interrupted"),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write("Usage: npm run release:ui -- [--open] [--ensure] [--port 4177]\n");
    return;
  }
  const portIndex = args.indexOf("--port");
  const requestedPort = portIndex >= 0 ? Number(args[portIndex + 1] || defaultPort) : defaultPort;
  const port = Number.isInteger(requestedPort) ? Math.max(1024, Math.min(65535, requestedPort)) : defaultPort;
  const shouldOpen = args.includes("--open");
  const ensure = args.includes("--ensure");
  const url = `http://127.0.0.1:${port}`;
  if (ensure && await controlUiAlreadyRunning(port)) {
    process.stdout.write(`SALT release control UI already running: ${url}\n`);
    if (shouldOpen) await openDesktopSurface(port, url);
    return;
  }
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(HTML);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        sendJson(response, 200, await readState());
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/log") {
        sendJson(response, 200, { log: await readOperationalLog(Math.min(maxLogChars, Math.max(1000, Number(url.searchParams.get("tail") || maxLogChars)))) });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/start") {
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (body.length > 50_000) throw new Error("request body is too large");
        }
        const result = await startRelease(JSON.parse(body || "{}"));
        sendJson(response, 202, result);
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/stop") {
        sendJson(response, 200, await stopRelease());
        return;
      }
      sendJson(response, 404, { error: "not found" });
    } catch (error) {
      sendJson(response, 400, { error: error?.message || String(error) });
    }
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", async (error) => {
      if (ensure && error?.code === "EADDRINUSE" && await controlUiAlreadyRunning(port)) {
        if (shouldOpen) openControlUi(url);
        resolvePromise();
        return;
      }
      rejectPromise(error);
    });
    server.listen(port, "127.0.0.1", resolvePromise);
  });
  if (server.listening) {
    process.stdout.write(`SALT release control UI: ${url}\n`);
    if (shouldOpen) await openDesktopSurface(port, url);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    process.stderr.write(`Release control UI failed: ${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
