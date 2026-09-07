import { describe, expect, it } from "vitest";

import { configuredTrainingPlan, normalizeEncoderCommand, resolveMetalPython } from "./ensure-visual-taxonomy-model.mjs";

describe("visual taxonomy staged training configuration", () => {
  it("passes the fine-tuning command and output checkpoint to the trainer", () => {
    const plan = configuredTrainingPlan({
      SALT_VISUAL_TRAINING_SOURCE_MANIFEST: "/external/source-manifest.jsonl",
      SALT_VISUAL_TRAINING_DATASET_DIR: "/external/visual-corpus",
      SALT_VISUAL_TRAINING_STAGED_LABELS_MANIFEST: "/external/visual-corpus.labels.jsonl",
      SALT_VISUAL_BASE_CHECKPOINT: "/external/base-encoder.safetensors",
      SALT_VISUAL_ENCODER_COMMAND_JSON: '["python3","encode.py"]',
      SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON: '["python3","finetune.py"]',
      SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT: "/external/fine-tuned-encoder.safetensors",
    });

    expect(plan.inputs).toMatchObject({
      SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT: "/external/fine-tuned-encoder.safetensors",
    });
    expect(JSON.parse(plan.inputs.SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON)[0]).toBe(resolveMetalPython());
    expect(plan.stage).toMatchObject({
      sourceManifest: "/external/source-manifest.jsonl",
      datasetDir: "/external/visual-corpus",
      labelsManifest: "/external/visual-corpus.labels.jsonl",
    });
  });

  it("accepts the sequential 25 GB shard training configuration", () => {
    const plan = configuredTrainingPlan({
      SALT_VISUAL_TRAINING_SHARD_PLAN: "/external/shard-plan.json",
      SALT_VISUAL_TRAINING_CORPUS_ROOT: "/external/visual-corpus",
      SALT_VISUAL_TRAINING_LABELS_ROOT: "/external/visual-labels",
      SALT_VISUAL_BASE_CHECKPOINT: "/external/base-encoder.json",
      SALT_VISUAL_ENCODER_COMMAND_JSON: '["python3","encode.py"]',
      SALT_VISUAL_ENCODER_TRAIN_COMMAND_JSON: '["python3","finetune.py"]',
      SALT_VISUAL_FINE_TUNED_ENCODER_CHECKPOINT: "/external/fine-tuned-encoder.safetensors",
    });

    expect(plan.sharded).toMatchObject({
      shardPlan: "/external/shard-plan.json",
      corpusRoot: "/external/visual-corpus",
      labelsRoot: "/external/visual-labels",
    });
    expect(JSON.parse(plan.inputs.SALT_VISUAL_ENCODER_COMMAND_JSON)[0]).toBe(resolveMetalPython());
    expect(plan.stage).toBeNull();
  });

  it("keeps an explicitly configured encoder command intact", () => {
    expect(normalizeEncoderCommand('["/custom/python","encoder.py","encode"]'))
      .toBe('["/custom/python","encoder.py","encode"]');
  });
});
