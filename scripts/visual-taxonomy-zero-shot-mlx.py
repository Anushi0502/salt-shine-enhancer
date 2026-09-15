#!/usr/bin/env python3
"""Run the local SigLIP checkpoint as a bounded zero-shot taxonomy scorer.

The model is used as review evidence only. It does not write Shopify data and
the Node-side release gate decides whether a product can leave fallback.
"""

import json
import os
import sys
from pathlib import Path

import mlx.core as mx


def require_metal():
    mx.set_default_device(mx.gpu)
    if mx.default_device() != mx.gpu:
        raise SystemExit(f"Metal/MLX device unavailable: {mx.default_device()}")
    mx.eval(mx.array([0], dtype=mx.float32))


def read_json(path: Path):
    try:
        return json.loads(path.read_text())
    except Exception as error:
        raise SystemExit(f"Could not read JSON {path}: {error}") from error


def read_jsonl(path: Path):
    entries = []
    try:
        with path.open() as handle:
            for line_number, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                try:
                    entries.append(json.loads(line))
                except Exception as error:
                    raise SystemExit(f"Invalid JSONL at {path}:{line_number}: {error}") from error
    except OSError as error:
        raise SystemExit(f"Could not read JSONL {path}: {error}") from error
    return entries


def checkpoint_model_path(checkpoint_path: Path):
    checkpoint = read_json(checkpoint_path)
    if checkpoint.get("kind") != "salt-visual-base-checkpoint":
        raise SystemExit(f"Invalid candidate checkpoint manifest: {checkpoint_path}")
    model_path = Path(str(checkpoint.get("modelPath", ""))).expanduser()
    if not model_path.is_dir():
        raise SystemExit(f"Candidate model directory does not exist: {model_path}")
    return model_path


def normalize_embeddings(value):
    value = value.astype(mx.float32)
    norms = mx.sqrt(mx.sum(value * value, axis=1, keepdims=True))
    return value / mx.maximum(norms, mx.array(1e-8, dtype=mx.float32))


def top_candidates(logits, labels):
    probabilities = mx.softmax(logits, axis=1)
    indices = mx.argsort(probabilities, axis=1)[:, ::-1][:, :3]
    values = mx.take_along_axis(probabilities, indices, axis=1)
    mx.eval(indices, values)
    output = []
    for row in range(len(indices)):
        row_indices = indices[row].tolist()
        row_values = values[row].tolist()
        candidates = [
            {
                "ruleId": labels[int(index)]["ruleId"],
                "probability": float(value),
            }
            for index, value in zip(row_indices, row_values)
        ]
        confidence = row_values[0] if row_values else 0.0
        margin = confidence - (row_values[1] if len(row_values) > 1 else 0.0)
        output.append((labels[int(row_indices[0])]["ruleId"] if row_indices else "", confidence, margin, candidates))
    return output


def main():
    if len(sys.argv) != 6 or sys.argv[5] != "--metal":
        raise SystemExit("usage: visual-taxonomy-zero-shot-mlx.py MANIFEST_JSONL LABELS_JSON OUTPUT_JSONL CHECKPOINT_JSON --metal")

    manifest_path = Path(sys.argv[1]).expanduser()
    labels_path = Path(sys.argv[2]).expanduser()
    output_path = Path(sys.argv[3]).expanduser()
    checkpoint_path = Path(sys.argv[4]).expanduser()
    require_metal()

    from mlx_embeddings import generate, load

    model_path = checkpoint_model_path(checkpoint_path)
    model, processor = load(str(model_path), lazy=True)
    entries = read_jsonl(manifest_path)
    labels = read_json(labels_path)
    if not entries:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text("")
        print(json.dumps({"status": "empty", "device": "metal", "records": 0}), flush=True)
        return
    if not isinstance(labels, list) or len(labels) < 2:
        raise SystemExit("At least two zero-shot taxonomy labels are required")

    prompt_groups = []
    for label in labels:
        prompts = label.get("prompts")
        if not isinstance(prompts, list) or not prompts:
            prompts = [label.get("prompt", "")]
        normalized = [str(prompt).strip() for prompt in prompts if str(prompt).strip()]
        if not normalized:
            raise SystemExit("Every zero-shot taxonomy label must provide a prompt")
        prompt_groups.append(normalized)
    prompts = [prompt for group in prompt_groups for prompt in group]

    # Encode the label prompts once. Image batches then reuse the text matrix,
    # keeping the expensive transformer work bounded while retaining Metal use.
    # mlx_embeddings currently passes a text-only list positionally, which
    # SigLIP's processor interprets as image inputs. Use the explicit text
    # keyword so the label matrix is encoded correctly.
    text_inputs = processor(
        text=prompts,
        return_tensors="mlx",
        padding=True,
        truncation=True,
        max_length=64,
    )
    text_embeds = model.get_text_features(**text_inputs)
    if text_embeds is None:
        raise SystemExit("SigLIP did not return text embeddings for zero-shot scoring")
    text_embeds = normalize_embeddings(text_embeds)
    prompt_offsets = []
    offset = 0
    for group in prompt_groups:
        prompt_offsets.append((offset, offset + len(group)))
        offset += len(group)
    # Average several phrasings per taxonomy label. This reduces sensitivity
    # to wording while keeping one calibrated score vector per label.
    text_embeds = mx.stack([
        normalize_embeddings(mx.mean(text_embeds[start:end], axis=0, keepdims=True))[0]
        for start, end in prompt_offsets
    ])

    try:
        scale = mx.exp(model.logit_scale.astype(mx.float32))
        bias = model.logit_bias.astype(mx.float32)
    except AttributeError as error:
        raise SystemExit(f"SigLIP checkpoint is missing logit calibration parameters: {error}") from error
    mx.eval(text_embeds, scale, bias)

    batch_size = max(1, min(16, int(os.environ.get("SALT_VISUAL_CANDIDATE_IMAGE_BATCH_SIZE", "8"))))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_name(f".{output_path.name}.tmp-{os.getpid()}")
    processed = 0
    with temporary_path.open("w") as destination:
        for start in range(0, len(entries), batch_size):
            batch = entries[start:start + batch_size]
            paths = [Path(str(entry.get("image", ""))) for entry in batch]
            missing = [str(path) for path in paths if not path.is_file()]
            if missing:
                raise SystemExit(f"Candidate image is missing from the review staging area: {missing[0]}")
            image_output = generate(
                model,
                processor,
                texts=["a retail product photo"] * len(paths),
                images=[str(path) for path in paths],
            )
            image_embeds = getattr(image_output, "image_embeds", None)
            if image_embeds is None:
                raise SystemExit("SigLIP did not return image embeddings for zero-shot scoring")
            image_embeds = normalize_embeddings(image_embeds)
            logits = image_embeds @ text_embeds.T * scale + bias
            for entry, (rule_id, confidence, margin, candidates) in zip(batch, top_candidates(logits, labels)):
                destination.write(json.dumps({
                    "productId": str(entry.get("productId", "")),
                    "imageSha256": str(entry.get("imageSha256", "")),
                    "ruleId": rule_id,
                    "confidence": confidence,
                    "margin": margin,
                    "candidates": candidates,
                    "device": "metal",
                }) + "\n")
            processed += len(batch)
            if processed % 25 == 0 or processed == len(entries):
                print(f"Candidate visual scoring {processed}/{len(entries)} images.", flush=True)
    temporary_path.replace(output_path)
    print(json.dumps({"status": "complete", "device": "metal", "records": processed, "labels": len(labels)}), flush=True)


if __name__ == "__main__":
    main()
