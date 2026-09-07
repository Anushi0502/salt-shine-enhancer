#!/usr/bin/env node

// Keep the legacy installer name safe: all scheduled releases must be owned
// by the supervised watcher, never by a one-shot unsupervised job.
await import("./install-realtime-release-watcher-launch-agent.mjs");
