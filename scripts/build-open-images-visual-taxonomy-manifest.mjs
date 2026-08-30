#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { once } from "node:events";

import { getCatalogTaxonomyDefinitions } from "../src/lib/catalog-taxonomy.js";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, "output");
const defaultOutput = resolve(outputDir, "visual-taxonomy-open-images-candidate-manifest.jsonl");
const defaultReport = resolve(outputDir, "visual-taxonomy-open-images-candidate-report.json");

export const OPEN_IMAGES_URLS = {
  classes: "https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions.csv",
  humanLabels: "https://storage.googleapis.com/openimages/v7/oidv7-train-annotations-human-imagelabels.csv",
  images: "https://storage.googleapis.com/openimages/2018_04/train/train-images-boxable-with-rotation.csv",
};

// These are intentionally narrow object-to-product mappings. They create
// candidate-only training evidence, never release taxonomy decisions.
export const OPEN_IMAGES_LABEL_RULES = {
  "Backpack": ["backpacks", 100],
  "Bag": ["bags-general", 40],
  "Handbag": ["handbags", 100],
  "Wallet": ["wallets", 100],
  "Suitcase": ["travel-bags", 100],
  "Shirt": ["shirts", 80],
  "T-shirt": ["t-shirts", 100],
  "Active shirt": ["t-shirts", 60],
  "Jacket": ["jackets-coats", 100],
  "Jeans": ["jeans", 100],
  "Shorts": ["shorts", 100],
  "Skirt": ["skirts", 100],
  "Dress": ["dresses", 100],
  "Hat": ["hats-caps", 100],
  "Baseball cap": ["hats-caps", 100],
  "Bucket hat": ["hats-caps", 100],
  "Shoe": ["shoes", 80],
  "Athletic shoe": ["shoes", 90],
  "Sock": ["socks", 100],
  "Glove": ["gloves", 100],
  "Necklace": ["necklaces", 100],
  "Bracelet": ["bracelets", 100],
  "Ring": ["rings", 100],
  "Earrings": ["earrings", 100],
  "Sunglasses": ["sunglasses", 100],
  "Watch": ["traditional-watch", 80],
  "Analog watch": ["traditional-watch", 100],
  "Headphones": ["headphones", 100],
  "Computer keyboard": ["keyboard", 100],
  "Computer mouse": ["computer-mouse", 100],
  "Camera": ["camera-accessory", 60],
  "Camera accessory": ["camera-accessory", 100],
  "Tripod": ["camera-accessory", 100],
  "Microphone": ["microphones", 100],
  "Bottle": ["water-bottles", 60],
  "Water bottle": ["water-bottles", 100],
  "Mug": ["dining", 60],
  "Cup": ["dining", 50],
  "Plate": ["serveware", 80],
  "Bowl": ["serveware", 80],
  "Knife": ["kitchen-gadgets", 60],
  "Spoon": ["kitchen-gadgets", 60],
  "Fork": ["kitchen-gadgets", 60],
  "Pot": ["cookware", 100],
  "Pan": ["cookware", 100],
  "Chair": ["home-furniture", 80],
  "Sofa": ["home-furniture", 100],
  "Bed": ["home-furniture", 70],
  "Pillow": ["sleep-support-pillows", 60],
  "Towel": ["towels", 100],
  "Candle": ["candles", 100],
  "Lamp": ["home-lighting", 70],
  "Basket": ["home-storage", 60],
  "Dog": ["dog-products", 100],
  "Cat": ["cat-products", 100],
  "Book": ["books-learning", 80],
  "Pen": ["writing-supplies", 100],
  "Pencil": ["writing-supplies", 100],
  "Scissors": ["craft-diy", 60],
  "Umbrella": ["rain-sun-umbrellas", 100],
  "Doll": ["toys-general", 70],
};

const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const attributionLicense = /^https:\/\/creativecommons\.org\/licenses\/by\/[^/]+\/?$/i;
const maxImageBytes = 50 * 1024 * 1024;

function parseArgs(argv) {
  const args = {
    output: process.env.SALT_OPEN_IMAGES_MANIFEST_OUTPUT || defaultOutput,
    report: process.env.SALT_OPEN_IMAGES_MANIFEST_REPORT || defaultReport,
    targetBytes: Number(process.env.SALT_OPEN_IMAGES_TARGET_BYTES || 50_000_000_000),
    maxRecords: Number(process.env.SALT_OPEN_IMAGES_MAX_RECORDS || 600_000),
  };
  const flags = new Map([
    ["--output", "output"], ["--report", "report"],
    ["--target-bytes", "targetBytes"], ["--max-records", "maxRecords"],
  ]);
  for (let index = 2; index < argv.length; index += 1) {
    const key = flags.get(argv[index]);
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Expected a supported Open Images manifest flag; got ${argv[index]}.`);
    args[key] = ["targetBytes", "maxRecords"].includes(key) ? Number(value) : value;
    index += 1;
  }
  if (!Number.isInteger(args.targetBytes) || args.targetBytes < 50_000_000_000) {
    throw new Error("--target-bytes must be at least 50 GB.");
  }
  if (!Number.isInteger(args.maxRecords) || args.maxRecords <= 0) {
    throw new Error("--max-records must be a positive integer.");
  }
  return { ...args, output: resolve(args.output), report: resolve(args.report) };
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

function normalizeLabel(label) {
  return String(label || "").replace(/^\uFEFF/, "").trim();
}

function stableSplit(imageId) {
  const value = createHash("sha256").update(imageId).digest()[0] % 20;
  if (value === 0) return "test";
  if (value <= 3) return "validation";
  return "train";
}

function imageExtension(url) {
  const value = String(url || "").split("?")[0].toLowerCase();
  const extension = [...allowedExtensions].find((candidate) => value.endsWith(candidate));
  return extension || ".jpg";
}

async function fetchLines(url) {
  const response = await fetch(url, {
    headers: { Accept: "text/csv", "User-Agent": "SALT-visual-taxonomy-manifest/1.0" },
    signal: AbortSignal.timeout(Math.max(10 * 60 * 1000, Number(process.env.SALT_OPEN_IMAGES_DOWNLOAD_TIMEOUT_MS || 6 * 60 * 60 * 1000))),
  });
  if (!response.ok || !response.body) throw new Error(`Open Images download failed (${response.status}) for ${url}`);
  return createInterface({ input: Readable.fromWeb(response.body), crlfDelay: Infinity });
}

async function loadClassMap() {
  const allowedRuleIds = new Set(getCatalogTaxonomyDefinitions().map((definition) => definition.id));
  const byLabel = new Map();
  const lines = await fetchLines(OPEN_IMAGES_URLS.classes);
  for await (const line of lines) {
    const [labelName, displayName] = parseCsvLine(line);
    const mapping = OPEN_IMAGES_LABEL_RULES[normalizeLabel(displayName)];
    if (mapping && allowedRuleIds.has(mapping[0])) byLabel.set(normalizeLabel(labelName), {
      labelName: normalizeLabel(labelName),
      displayName: normalizeLabel(displayName),
      ruleId: mapping[0],
      priority: mapping[1],
    });
  }
  if (byLabel.size < 2) throw new Error("Open Images class mapping produced fewer than two valid taxonomy labels.");
  return byLabel;
}

async function collectVerifiedLabels(classMap) {
  const selected = new Map();
  const lines = await fetchLines(OPEN_IMAGES_URLS.humanLabels);
  let scanned = 0;
  for await (const line of lines) {
    if (!line || line.startsWith("ImageID,")) continue;
    const [imageId, source, labelName] = parseCsvLine(line);
    scanned += 1;
    if (normalizeLabel(source).toLowerCase() !== "verification") continue;
    const mapped = classMap.get(normalizeLabel(labelName));
    if (!mapped) continue;
    const existing = selected.get(imageId);
    if (!existing || mapped.priority > existing.priority) {
      selected.set(imageId, { ...mapped, verificationSource: "verification" });
    }
    if (scanned % 500_000 === 0) process.stdout.write(`Open Images labels scanned: ${scanned}; selected images: ${selected.size}\n`);
  }
  return { selected, scanned };
}

async function writeManifest(args, selected) {
  await mkdir(dirname(args.output), { recursive: true });
  const temporary = `${args.output}.tmp-${process.pid}`;
  const output = createWriteStream(temporary, { encoding: "utf8" });
  let records = 0;
  let estimatedBytes = 0;
  let attributionRecords = 0;
  let skippedLicense = 0;
  let skippedInvalid = 0;
  let scannedMetadata = 0;
  const emitted = new Set();
  const lines = await fetchLines(OPEN_IMAGES_URLS.images);
  try {
    for await (const line of lines) {
      if (!line || line.startsWith("ImageID,")) continue;
      scannedMetadata += 1;
      const fields = parseCsvLine(line);
      const [imageId, subset, originalUrl, landingUrl, license, authorProfileUrl, author, title, originalSize, originalMd5] = fields;
      const selectedLabel = selected.get(imageId);
      if (!selectedLabel || subset !== "train" || emitted.has(imageId)) continue;
      if (!attributionLicense.test(normalizeLabel(license))) {
        skippedLicense += 1;
        continue;
      }
      const bytes = Number(originalSize);
      if (!/^https?:\/\//i.test(originalUrl) || !/^https?:\/\//i.test(landingUrl) || !Number.isInteger(bytes) || bytes <= 0 || bytes > maxImageBytes) {
        skippedInvalid += 1;
        continue;
      }
      const record = {
        sourceUrl: originalUrl,
        productId: `open-images-v7:${imageId}`,
        ruleId: selectedLabel.ruleId,
        labelSource: "external-human-verified-candidate",
        candidateOnly: true,
        split: stableSplit(imageId),
        bytes,
        sourceEvidence: {
          dataset: "Open Images V7",
          datasetVersion: "V7",
          imageId,
          labelName: selectedLabel.displayName,
          labelSource: selectedLabel.verificationSource,
          license,
          originalLandingUrl: landingUrl,
          author: author || null,
          authorProfileUrl: authorProfileUrl || null,
          title: title || null,
          originalMd5: originalMd5 || null,
          trainingUse: "candidate-only visual feature evidence; not a release taxonomy decision",
        },
      };
      if (!output.write(`${JSON.stringify(record)}\n`)) await once(output, "drain");
      emitted.add(imageId);
      records += 1;
      estimatedBytes += bytes;
      attributionRecords += 1;
      if (records % 10_000 === 0) process.stdout.write(`Open Images manifest: ${records} records, ${estimatedBytes} bytes\n`);
      if (records >= args.maxRecords || estimatedBytes >= args.targetBytes) break;
    }
  } finally {
    output.end();
    await once(output, "close");
  }
  await rename(temporary, args.output);
  return { records, estimatedBytes, attributionRecords, skippedLicense, skippedInvalid, scannedMetadata };
}

export async function buildOpenImagesManifest(args = parseArgs(process.argv)) {
  const classMap = await loadClassMap();
  const { selected, scanned } = await collectVerifiedLabels(classMap);
  const result = await writeManifest(args, selected);
  const report = {
    kind: "salt-open-images-visual-taxonomy-candidate-manifest",
    version: 1,
    generatedAt: new Date().toISOString(),
    source: OPEN_IMAGES_URLS,
    labelPolicy: "external-human-verified-candidate-only",
    candidateOnly: true,
    licensePolicy: "Creative Commons Attribution only; license and landing evidence retained per record",
    taxonomyLabels: [...new Set([...selected.values()].map((entry) => entry.ruleId))].sort(),
    classMappings: classMap.size,
    humanLabelsScanned: scanned,
    selectedImageIds: selected.size,
    output: args.output,
    ...result,
    targetBytes: args.targetBytes,
    status: result.estimatedBytes >= args.targetBytes ? "ready-for-hydration" : "source-may-be-insufficient",
  };
  await mkdir(dirname(args.report), { recursive: true });
  await writeFile(args.report, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  buildOpenImagesManifest().then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

export { parseArgs, parseCsvLine, stableSplit };
