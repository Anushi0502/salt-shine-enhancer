#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateCostBasedPricingApproval } from "../src/lib/shopify-cost-based-pricing-approval.js";

const rootDir = resolve(import.meta.dirname, "..");
const approvalPath = resolve(rootDir, "docs", "catalog-cost-based-pricing-approval.json");

const approval = await readFile(approvalPath, "utf8").then(JSON.parse).catch((error) => {
  throw new Error(`Cost-based pricing approval could not be read: ${error.message}`);
});

const approvalId = validateCostBasedPricingApproval(approval);
process.stdout.write(`Cost-based pricing approval verified: ${approvalId}.\n`);
