#!/usr/bin/env python3
"""Run a verified MLX taxonomy adapter over streamed image embeddings."""

import json
import sys
from pathlib import Path

import mlx.core as mx


def normalize_embeddings(x):
    norms = mx.sqrt(mx.sum(x * x, axis=1, keepdims=True))
    return x / mx.maximum(norms, mx.array(1e-8, dtype=mx.float32))


def head_logits(x, weights):
    logits = x @ weights["weights"].T + weights["bias"]
    if "hiddenWeights" in weights:
        hidden = mx.maximum(x @ weights["hiddenWeights"].T + weights["hiddenBias"], 0.0)
        logits = logits + hidden @ weights["residualWeights"].T + weights["residualBias"]
    return logits


def main():
    if len(sys.argv) != 6 or sys.argv[5] != "--metal":
        raise SystemExit("usage: visual-taxonomy-infer-mlx.py EMBEDDINGS_JSONL WEIGHTS_NPZ LABELS_JSON OUTPUT_JSONL --metal")

    embeddings_path = Path(sys.argv[1])
    weights_path = sys.argv[2]
    labels = json.loads(Path(sys.argv[3]).read_text())
    output_path = Path(sys.argv[4])
    label_by_index = {int(entry["index"]): entry["ruleId"] for entry in labels}
    disabled_indices = {
        int(entry["index"])
        for entry in labels
        if entry.get("trained", True) is False
    }
    weights = mx.load(weights_path)
    model_weights = {
        key: value.astype(mx.float32)
        for key, value in weights.items()
        if key in {"weights", "bias", "hiddenWeights", "hiddenBias", "residualWeights", "residualBias", "selectiveMargin"}
    }
    model_key_set = set(model_weights)
    allowed_linear = [{"weights", "bias"}, {"weights", "bias", "selectiveMargin"}]
    allowed_mlp = {"weights", "bias", "hiddenWeights", "hiddenBias", "residualWeights", "residualBias"}
    if model_key_set not in allowed_linear and model_key_set not in (allowed_mlp, allowed_mlp | {"selectiveMargin"}):
        raise SystemExit("Visual taxonomy weights contain an incomplete classifier head")
    mx.set_default_device(mx.gpu)
    mx.eval(*model_weights.values())
    selective_margin = None
    if "selectiveMargin" in model_weights:
        selective_margin = float(model_weights["selectiveMargin"].reshape(-1)[0].item())

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with embeddings_path.open() as source, output_path.open("w") as destination:
        batch = []
        metadata = []

        def flush():
            if not batch:
                return
            x = normalize_embeddings(mx.array(batch, dtype=mx.float32))
            logits = head_logits(x, model_weights)
            if disabled_indices:
                enabled = mx.array(
                    [0.0 if index in disabled_indices else 1.0 for index in range(len(label_by_index))],
                    dtype=mx.float32,
                )
                logits = logits - (1.0 - enabled)[None, :] * 1_000_000.0
            probabilities = mx.softmax(logits, axis=1)
            top_indices = mx.argsort(probabilities, axis=1)[:, ::-1][:, :min(3, len(label_by_index))]
            top_values = mx.take_along_axis(probabilities, top_indices, axis=1)
            mx.eval(top_values, top_indices)
            for index, record in enumerate(metadata):
                scores = top_values[index].tolist()
                candidates = [
                    {"ruleId": label_by_index[int(candidate)], "probability": float(score)}
                    for candidate, score in zip(top_indices[index].tolist(), scores)
                ]
                confidence = scores[0] if scores else 0.0
                margin = confidence - (scores[1] if len(scores) > 1 else 0.0)
                logit_margin = float((top_values[index, 0] - top_values[index, 1]).item()) if len(scores) > 1 else 0.0
                destination.write(json.dumps({
                    **record,
                    "ruleId": candidates[0]["ruleId"] if candidates else "",
                    "confidence": confidence,
                    "margin": margin,
                    "logitMargin": logit_margin,
                    "selectiveMargin": selective_margin,
                    "selectiveAccepted": selective_margin is None or logit_margin >= selective_margin,
                    "candidates": candidates,
                }) + "\n")
            batch.clear()
            metadata.clear()

        for line in source:
            if not line.strip():
                continue
            record = json.loads(line)
            batch.append(record["embedding"])
            metadata.append({
                "imageSha256": record["imageSha256"],
                "productId": record["productId"],
            })
            if len(batch) >= 256:
                flush()
        flush()


if __name__ == "__main__":
    main()
