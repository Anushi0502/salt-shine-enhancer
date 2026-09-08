// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  findRunningWatcherPids,
  hasCatalogBoundaryDrift,
  getExplicitResumeStep,
  resolveResumeStep,
  shouldForceRestartFromStepOne,
  shouldRefreshSeoLiveCatalogOnResume,
} from "./release.mjs";

const steps = [
  { label: "Build shared full-catalog release snapshot" },
  { label: "Reconcile and verify Shopify SEO/product fields" },
  { label: "Final live-readback gate against the applied catalog generation" },
];

describe("release checkpoint resume", () => {
  it("discovers a live watcher without treating ps or rg itself as a watcher", () => {
    expect(findRunningWatcherPids([
      "80842 node scripts/realtime-release-watcher.mjs",
      "80843 rg realtime-release-watcher.mjs",
      "80844 /bin/ps -axo pid=,command=",
    ].join("\n"), () => true)).toEqual([80842]);
  });

  it("maps a checkpoint by label instead of numeric position", () => {
    expect(resolveResumeStep(steps, {
      stepIndex: 9,
      totalSteps: 56,
      stepLabel: "Reconcile and verify Shopify SEO/product fields",
    })).toEqual({ resumeFromStep: 2, restarted: false });
  });

  it("retries the failed checkpoint instead of skipping it", () => {
    expect(resolveResumeStep(steps, {
      stageStatus: "failed",
      stepLabel: "Reconcile and verify Shopify SEO/product fields",
    })).toEqual({ resumeFromStep: 2, restarted: false });
  });

  it("restarts safely when a checkpoint label is not in the current graph", () => {
    expect(resolveResumeStep(steps, {
      stepIndex: 9,
      totalSteps: 56,
      stepLabel: "Removed release stage",
    }, 9)).toEqual({ resumeFromStep: 1, restarted: true });
  });

  it("keeps numeric fallback only for unlabeled legacy checkpoints", () => {
    expect(resolveResumeStep(steps, {}, 9)).toEqual({ resumeFromStep: 9, restarted: false });
  });

  it("maps legacy sequential catalog refresh labels to the parallel stage", () => {
    const optimizedSteps = [
      { label: "Refresh Shopify data: Shopify product and collection data" },
      { label: "Refresh Shopify data: recently ordered products and managed collection membership (parallel)" },
      ...steps.slice(1),
    ];

    expect(resolveResumeStep(optimizedSteps, {
      stepLabel: "Refresh Shopify data: managed collection membership",
    })).toEqual({ resumeFromStep: 2, restarted: false });
  });

  it("rewinds a strict collection audit failure to the final reconciliation", () => {
    const optimizedSteps = [
      { label: "Apply final current-generation collection reconciliation" },
      { label: "Strict live audit of repaired collection classification" },
      ...steps.slice(2),
    ];

    expect(resolveResumeStep(optimizedSteps, {
      stepIndex: 2,
      stepLabel: "Strict live audit of repaired collection classification",
    })).toEqual({ resumeFromStep: 1, restarted: false, reason: "collection-audit-repair" });
  });

  it("forces a fresh live SEO catalog after a failed SEO stage", () => {
    expect(shouldRefreshSeoLiveCatalogOnResume({
      status: "failed",
      stepLabel: "Reconcile and verify Shopify SEO/product fields",
      error: "SEO verification failed for one product",
    })).toBe(true);
    expect(shouldRefreshSeoLiveCatalogOnResume({
      status: "failed",
      stepLabel: "Build web app",
      error: "Vite build failed",
    })).toBe(false);
    expect(shouldRefreshSeoLiveCatalogOnResume({
      status: "running",
      stepLabel: "Reconcile and verify Shopify SEO/product fields",
    })).toBe(false);
  });

  it("detects catalog scope drift preserved inside a guarded stage failure", () => {
    expect(hasCatalogBoundaryDrift({
      status: "failed",
      stepLabel: "Reconcile and verify Shopify SEO/product fields",
      error: "Catalog integrity scope drifted: manifest has 16386 active products and 16386 classifications; Shopify has 16329.",
    })).toBe(true);
    expect(hasCatalogBoundaryDrift({
      status: "failed",
      stepLabel: "Reconcile and verify Shopify SEO/product fields",
      error: "Live taxonomy tags and metafields dry-run failed with exit code 1",
      stageStderr: "network timeout while reading Shopify",
    })).toBe(false);
  });

  it("honors an explicit step-one restart marker", () => {
    expect(shouldForceRestartFromStepOne({ restartFromStep: 1 })).toBe(true);
    expect(shouldForceRestartFromStepOne({ restartFromStep: 15 })).toBe(false);
    expect(shouldForceRestartFromStepOne({})).toBe(false);
  });

  it("honors an explicit resume stage marker", () => {
    expect(getExplicitResumeStep({ resumeFromStepOverride: 30 })).toBe(30);
    expect(getExplicitResumeStep({ resumeFromStepOverride: 30.5 })).toBe(null);
    expect(getExplicitResumeStep({ resumeFromStepOverride: 0 })).toBe(null);
  });
});
