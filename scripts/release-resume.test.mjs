import { describe, expect, it } from "vitest";

import { resolveResumeStep, shouldRefreshSeoLiveCatalogOnResume } from "./release.mjs";

const steps = [
  { label: "Build shared full-catalog release snapshot" },
  { label: "Reconcile and verify Shopify SEO/product fields" },
  { label: "Final live-readback gate against the applied catalog generation" },
];

describe("release checkpoint resume", () => {
  it("maps a checkpoint by label instead of numeric position", () => {
    expect(resolveResumeStep(steps, {
      stepIndex: 9,
      totalSteps: 56,
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
});
