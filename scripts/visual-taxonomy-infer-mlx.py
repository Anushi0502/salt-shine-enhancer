#!/usr/bin/env python3
"""Run a verified MLX taxonomy adapter over streamed image embeddings."""

import json
import sys
from pathlib import Path

import mlx.core as mx


def main():
    if len(sys.argv) != 6 or sys.argv[5] != "--metal":
        raise SystemExit("usage: visual-taxonomy-infer-mlx.py EMBEDDINGS_JSONL WEIGHTS_NPZ LABELS_JSON OUTPUT_JSONL --metal")

    embeddings_path = Path(sys.argv[1])
    weights_path = sys.argv[2]
    labels = json.loads(Path(sys.argv[3]).read_text())
    output_path = Path(sys.argv[4])
    label_by_index = {int(entry["index"]): entry["ruleId"] for entry in labels}
    weights = mx.load(weights_path)
    model_weights = weights["weights"].astype(mx.float32)
    bias = weights["bias"].astype(mx.float32)
    mx.set_default_device(mx.gpu)
    mx.eval(model_weights, bias)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with embeddings_path.open() as source, output_path.open("w") as destination:
        batch = []
        metadata = []

        def flush():
            if not batch:
                return
            x = mx.array(batch, dtype=mx.float32)
            logits = x @ model_weights.T + bias
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
                destination.write(json.dumps({
                    **record,
                    "ruleId": candidates[0]["ruleId"] if candidates else "",
                    "confidence": confidence,
                    "margin": margin,
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
