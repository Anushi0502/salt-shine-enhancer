#!/usr/bin/env python3
"""Train a small taxonomy head over embeddings produced by a declared image encoder.

The raw image corpus is intentionally not read by this process. The Node
orchestrator validates and hashes it, then asks the declared encoder for
embeddings. This keeps the 50 GB corpus streamed and lets the encoder use the
available Metal/Neural Engine implementation without pretending that a text
model is an image model.
"""

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import mlx.core as mx


def batches(path, batch_size, label_to_index):
    features = []
    labels = []
    splits = []
    with Path(path).open() as handle:
        for line in handle:
            if not line.strip():
                continue
            record = json.loads(line)
            features.append(record["embedding"])
            labels.append(label_to_index[record["ruleId"]])
            splits.append(record["split"])
            if len(features) >= batch_size:
                yield features, labels, splits
                features, labels, splits = [], [], []
    if features:
        yield features, labels, splits


def score_split(weights, bias, path, label_to_index, split, batch_size, total_records):
    total = 0
    correct = 0
    confusion = defaultdict(lambda: [0, 0, 0])
    for feature_rows, labels, splits in batches(path, batch_size, label_to_index):
        selected = [index for index, value in enumerate(splits) if value == split]
        if not selected:
            continue
        x = mx.array([feature_rows[index] for index in selected], dtype=mx.float32)
        y = mx.array([labels[index] for index in selected], dtype=mx.int32)
        logits = x @ weights.T + bias
        predictions = mx.argmax(logits, axis=1)
        mx.eval(predictions)
        predicted_values = predictions.tolist()
        actual_values = y.tolist()
        total += len(actual_values)
        correct += sum(actual == predicted for actual, predicted in zip(actual_values, predicted_values))
        for actual, predicted in zip(actual_values, predicted_values):
            if actual == predicted:
                confusion[actual][0] += 1
            else:
                confusion[actual][1] += 1
                confusion[predicted][2] += 1

    per_class_f1 = []
    for true_positive, false_negative, false_positive in confusion.values():
        precision = true_positive / max(1, true_positive + false_positive)
        recall = true_positive / max(1, true_positive + false_negative)
        per_class_f1.append(2 * precision * recall / max(1e-9, precision + recall))
    return {
        "records": total,
        "accuracy": correct / max(1, total),
        "coverage": total / max(1, total_records),
        "macroF1": sum(per_class_f1) / max(1, len(per_class_f1)),
    }


def main():
    if len(sys.argv) != 6:
        raise SystemExit("usage: visual-taxonomy-train-mlx.py RECORDS_JSONL WEIGHTS_NPZ METRICS_JSON LABELS_JSON")

    records_path = sys.argv[1]
    weights_path = Path(sys.argv[2])
    metrics_path = Path(sys.argv[3])
    labels_path = Path(sys.argv[4])
    # Keep one reserved positional slot for future backend versioning while
    # rejecting accidental invocations with a wrong argument count.
    if sys.argv[5] != "--metal":
        raise SystemExit("the MLX backend requires the final --metal marker")

    labels = json.loads(labels_path.read_text())
    label_to_index = {entry["ruleId"]: int(entry["index"]) for entry in labels}
    if len(label_to_index) < 2:
        raise SystemExit("at least two visual taxonomy labels are required")

    dimension = None
    record_count = 0
    split_counts = defaultdict(int)
    train_label_counts = defaultdict(int)
    with Path(records_path).open() as handle:
        for line in handle:
            if not line.strip():
                continue
            record = json.loads(line)
            embedding = record["embedding"]
            if dimension is None:
                dimension = len(embedding)
            if len(embedding) != dimension:
                raise SystemExit("inconsistent embedding dimensions")
            if record["ruleId"] not in label_to_index:
                raise SystemExit(f"unknown visual taxonomy label: {record['ruleId']}")
            record_count += 1
            split_counts[record["split"]] += 1
            if record["split"] == "train":
                train_label_counts[record["ruleId"]] += 1
    if not dimension or record_count == 0:
        raise SystemExit("no embeddings were supplied")
    if not split_counts["train"] or not split_counts["validation"] or not split_counts["test"]:
        raise SystemExit("train, validation, and test splits must all contain records")

    try:
        mx.set_default_device(mx.gpu)
        mx.eval(mx.array([0], dtype=mx.float32))
    except Exception as error:
        raise SystemExit(f"Metal/MLX device unavailable: {error}")

    label_count = len(label_to_index)
    missing_train_labels = [rule_id for rule_id in label_to_index if not train_label_counts[rule_id]]
    if missing_train_labels:
        raise SystemExit(f"every visual taxonomy label needs at least one training record; missing {len(missing_train_labels)}")
    train_total = sum(train_label_counts.values())
    class_weight_values = [
        train_total / (label_count * train_label_counts[entry["ruleId"]])
        for entry in labels
    ]
    class_weights = mx.array(class_weight_values, dtype=mx.float32)
    mx.random.seed(17)
    weights = mx.random.normal((label_count, dimension), dtype=mx.float32) * 0.01
    bias = mx.zeros((label_count,), dtype=mx.float32)
    eye = mx.eye(label_count, dtype=mx.float32)
    learning_rate = float(os.environ.get("SALT_VISUAL_TRAINING_LEARNING_RATE", "0.05"))
    epochs = max(1, int(os.environ.get("SALT_VISUAL_TRAINING_EPOCHS", "5")))
    batch_size = max(8, int(os.environ.get("SALT_VISUAL_TRAINING_BATCH_SIZE", "256")))

    checkpoint_raw = os.environ.get("SALT_VISUAL_TRAINING_CHECKPOINT_PATH", "").strip()
    metadata_raw = os.environ.get("SALT_VISUAL_TRAINING_CHECKPOINT_METADATA_PATH", "").strip()
    manifest_sha256 = os.environ.get("SALT_VISUAL_TRAINING_MANIFEST_SHA256", "").strip()
    if bool(checkpoint_raw) != bool(metadata_raw):
        raise SystemExit("training checkpoint and checkpoint metadata paths must be supplied together")
    checkpoint_path = Path(checkpoint_raw) if checkpoint_raw else None
    checkpoint_metadata_path = Path(metadata_raw) if metadata_raw else None
    start_epoch = 0
    best_epoch = 0
    best_validation = None
    best_weights = None
    best_bias = None
    stale_epochs = 0

    if checkpoint_path and checkpoint_metadata_path:
        checkpoint_exists = checkpoint_path.exists()
        metadata_exists = checkpoint_metadata_path.exists()
        if checkpoint_exists != metadata_exists:
            raise SystemExit("training checkpoint is incomplete; refusing to resume")
        if checkpoint_exists:
            try:
                checkpoint_metadata = json.loads(checkpoint_metadata_path.read_text())
                if checkpoint_metadata.get("manifestSha256") != manifest_sha256:
                    raise SystemExit("training checkpoint belongs to a different signed image manifest")
                if int(checkpoint_metadata.get("embeddingDimensions", -1)) != dimension:
                    raise SystemExit("training checkpoint embedding dimensions do not match the current manifest")
                if int(checkpoint_metadata.get("labelCount", -1)) != label_count:
                    raise SystemExit("training checkpoint label count does not match the current labels")
                if float(checkpoint_metadata.get("learningRate")) != learning_rate:
                    raise SystemExit("training checkpoint learning rate does not match the current run")
                if int(checkpoint_metadata.get("epochs", -1)) != epochs:
                    raise SystemExit("training checkpoint epoch count does not match the current run")
                if int(checkpoint_metadata.get("batchSize", -1)) != batch_size:
                    raise SystemExit("training checkpoint batch size does not match the current run")
                start_epoch = int(checkpoint_metadata.get("completedEpoch", -1))
                if start_epoch < 0 or start_epoch > epochs:
                    raise SystemExit("training checkpoint completed epoch is invalid")
                checkpoint = mx.load(str(checkpoint_path))
                if "weights" not in checkpoint or "bias" not in checkpoint:
                    raise SystemExit("training checkpoint is missing classifier weights")
                loaded_weights = mx.array(checkpoint["weights"], dtype=mx.float32)
                loaded_bias = mx.array(checkpoint["bias"], dtype=mx.float32)
                if tuple(loaded_weights.shape) != (label_count, dimension) or tuple(loaded_bias.shape) != (label_count,):
                    raise SystemExit("training checkpoint classifier shape does not match the current manifest")
                weights = loaded_weights
                bias = loaded_bias
                if "bestWeights" in checkpoint and "bestBias" in checkpoint:
                    best_weights = mx.array(checkpoint["bestWeights"], dtype=mx.float32)
                    best_bias = mx.array(checkpoint["bestBias"], dtype=mx.float32)
                    if tuple(best_weights.shape) != (label_count, dimension) or tuple(best_bias.shape) != (label_count,):
                        raise SystemExit("training checkpoint best classifier shape does not match the current manifest")
                else:
                    best_weights = weights
                    best_bias = bias
                best_epoch = int(checkpoint_metadata.get("bestEpoch", start_epoch))
                best_validation = checkpoint_metadata.get("bestValidation")
                stale_epochs = int(checkpoint_metadata.get("staleEpochs", 0))
                if best_epoch < 0 or best_epoch > start_epoch or stale_epochs < 0:
                    raise SystemExit("training checkpoint validation state is invalid")
                mx.eval(weights, bias)
                print(json.dumps({"resumedFromCheckpoint": str(checkpoint_path), "completedEpoch": start_epoch}), flush=True)
            except SystemExit:
                raise
            except Exception as error:
                raise SystemExit(f"could not validate training checkpoint: {error}")

    def save_training_checkpoint(completed_epoch):
        if not checkpoint_path or not checkpoint_metadata_path:
            return
        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        checkpoint_metadata_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_weights = checkpoint_path.with_name(f".{checkpoint_path.name}.tmp-{os.getpid()}.npz")
        temporary_metadata = checkpoint_metadata_path.with_name(f"{checkpoint_metadata_path.name}.tmp-{os.getpid()}")
        mx.savez(
            str(temporary_weights),
            weights=weights.astype(mx.float16),
            bias=bias.astype(mx.float16),
            bestWeights=best_weights.astype(mx.float16),
            bestBias=best_bias.astype(mx.float16),
        )
        os.replace(temporary_weights, checkpoint_path)
        temporary_metadata.write_text(json.dumps({
            "manifestSha256": manifest_sha256,
            "completedEpoch": completed_epoch,
            "embeddingDimensions": dimension,
            "labelCount": label_count,
            "learningRate": learning_rate,
            "epochs": epochs,
            "batchSize": batch_size,
            "bestEpoch": best_epoch,
            "bestValidation": best_validation,
            "staleEpochs": stale_epochs,
        }, indent=2) + "\n")
        os.replace(temporary_metadata, checkpoint_metadata_path)

    def loss_fn(current_weights, current_bias, x, y):
        logits = x @ current_weights.T + current_bias
        log_probs = logits - mx.logsumexp(logits, axis=1, keepdims=True)
        return -mx.mean(class_weights[y] * mx.sum(eye[y] * log_probs, axis=1))

    value_and_grad = mx.value_and_grad(loss_fn, argnums=(0, 1))
    last_loss = None
    patience = max(1, int(os.environ.get("SALT_VISUAL_TRAINING_EARLY_STOP_PATIENCE", "2")))
    for epoch in range(start_epoch, epochs):
        for feature_rows, labels_batch, splits in batches(records_path, batch_size, label_to_index):
            selected = [index for index, value in enumerate(splits) if value == "train"]
            if not selected:
                continue
            x = mx.array([feature_rows[index] for index in selected], dtype=mx.float32)
            y = mx.array([labels_batch[index] for index in selected], dtype=mx.int32)
            loss, gradients = value_and_grad(weights, bias, x, y)
            weights = weights - learning_rate * gradients[0]
            bias = bias - learning_rate * gradients[1]
            mx.eval(weights, bias, loss)
            last_loss = float(loss.item())
        validation = score_split(weights, bias, records_path, label_to_index, "validation", batch_size, record_count)
        if best_validation is None or (
            validation["macroF1"], validation["accuracy"]
        ) > (
            float(best_validation.get("macroF1", -1)),
            float(best_validation.get("accuracy", -1)),
        ):
            best_validation = validation
            best_epoch = epoch + 1
            best_weights = weights
            best_bias = bias
            stale_epochs = 0
        else:
            stale_epochs += 1
        save_training_checkpoint(epoch + 1)
        print(json.dumps({"epoch": epoch + 1, "epochs": epochs, "loss": last_loss, "validation": validation, "bestEpoch": best_epoch}), flush=True)
        if stale_epochs >= patience:
            break

    if best_weights is None or best_bias is None:
        best_weights = weights
        best_bias = bias
    validation = score_split(best_weights, best_bias, records_path, label_to_index, "validation", batch_size, record_count)
    test = score_split(best_weights, best_bias, records_path, label_to_index, "test", batch_size, record_count)
    train = score_split(best_weights, best_bias, records_path, label_to_index, "train", batch_size, record_count)
    min_validation_macro_f1 = float(os.environ.get("SALT_VISUAL_MIN_VALIDATION_MACRO_F1", "0.55"))
    min_test_macro_f1 = float(os.environ.get("SALT_VISUAL_MIN_TEST_MACRO_F1", "0.55"))
    min_test_accuracy = float(os.environ.get("SALT_VISUAL_MIN_TEST_ACCURACY", "0.60"))
    quality_gate = {
        "passed": validation["macroF1"] >= min_validation_macro_f1 and test["macroF1"] >= min_test_macro_f1 and test["accuracy"] >= min_test_accuracy,
        "minimumValidationMacroF1": min_validation_macro_f1,
        "minimumTestMacroF1": min_test_macro_f1,
        "minimumTestAccuracy": min_test_accuracy,
        "bestEpoch": best_epoch,
    }
    if not quality_gate["passed"]:
        raise SystemExit(json.dumps({"error": "visual taxonomy quality gate failed", "validation": validation, "test": test, "qualityGate": quality_gate}))
    weights_path.parent.mkdir(parents=True, exist_ok=True)
    mx.savez(str(weights_path), weights=best_weights.astype(mx.float16), bias=best_bias.astype(mx.float16))
    mx.eval(best_weights, best_bias)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.write_text(json.dumps({
        "backend": "mlx-metal",
        "device": "metal",
        "precision": "float16",
        "epochs": epochs,
        "epochsCompleted": max(start_epoch, best_epoch),
        "earlyStopped": stale_epochs >= patience,
        "batchSize": batch_size,
        "classBalanced": True,
        "classWeights": class_weight_values,
        "trainLabelCounts": {entry["ruleId"]: train_label_counts[entry["ruleId"]] for entry in labels},
        "metrics": {"train": train, "validation": validation, "test": test, "qualityGate": quality_gate},
        "records": record_count,
        "embeddingDimensions": dimension,
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
