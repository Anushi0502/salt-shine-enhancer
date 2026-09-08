#!/usr/bin/env python3
"""Train a calibrated Metal taxonomy head over streamed image embeddings.

The backbone is trained separately. This process learns a small linear head
over frozen image features, then calibrates a selective margin threshold on
validation data. Low-margin predictions stay in the explicit review queue;
the quality gate measures only decisions that the model is willing to publish.
"""

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

import mlx.core as mx
import numpy as np


SPLIT_CODES = {"train": 0, "validation": 1, "test": 2}
FEATURE_TRANSFORM = "l2-normalize-calibrated-linear-v5"


def jsonl_batches(path, batch_size, label_to_index):
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


def build_numeric_cache(path, label_to_index, dimension, record_count):
    """Materialize the immutable JSONL once so all epochs use mmap reads."""
    source = Path(path)
    source_stat = source.stat()
    prefix = source.with_suffix(".features")
    features_path = Path(f"{prefix}.npy")
    labels_path = Path(f"{prefix}.labels.npy")
    splits_path = Path(f"{prefix}.splits.npy")
    metadata_path = Path(f"{prefix}.json")
    expected_metadata = {
        "sourceSize": source_stat.st_size,
        "sourceMtimeNs": source_stat.st_mtime_ns,
        "recordCount": record_count,
        "dimension": dimension,
        "labelCount": len(label_to_index),
    }
    try:
        metadata = json.loads(metadata_path.read_text())
        if metadata != expected_metadata:
            raise ValueError("numeric cache metadata does not match the current embedding stream")
        features = np.load(features_path, mmap_mode="r")
        labels = np.load(labels_path, mmap_mode="r")
        splits = np.load(splits_path, mmap_mode="r")
        if features.shape != (record_count, dimension) or labels.shape != (record_count,) or splits.shape != (record_count,):
            raise ValueError("numeric cache shapes do not match the current embedding stream")
        return {"features": features, "labels": labels, "splits": splits}
    except Exception:
        pass

    temporary_features = Path(f"{features_path}.tmp-{os.getpid()}")
    temporary_labels = Path(f"{labels_path}.tmp-{os.getpid()}")
    temporary_splits = Path(f"{splits_path}.tmp-{os.getpid()}")
    temporary_metadata = Path(f"{metadata_path}.tmp-{os.getpid()}")
    try:
        features = np.lib.format.open_memmap(temporary_features, mode="w+", dtype=np.float32, shape=(record_count, dimension))
        labels = np.empty(record_count, dtype=np.int32)
        splits = np.empty(record_count, dtype=np.uint8)
        index = 0
        with source.open() as handle:
            for line in handle:
                if not line.strip():
                    continue
                record = json.loads(line)
                if index >= record_count:
                    raise ValueError("embedding stream grew while building its numeric cache")
                embedding = np.asarray(record["embedding"], dtype=np.float32)
                if embedding.shape != (dimension,):
                    raise ValueError("inconsistent embedding dimensions in numeric cache")
                rule_id = record["ruleId"]
                split = record["split"]
                if rule_id not in label_to_index or split not in SPLIT_CODES:
                    raise ValueError("embedding stream contains an unknown label or split")
                features[index] = embedding
                labels[index] = label_to_index[rule_id]
                splits[index] = SPLIT_CODES[split]
                index += 1
        if index != record_count:
            raise ValueError(f"embedding stream contains {index}/{record_count} records")
        features.flush()
        np.save(temporary_labels, labels)
        np.save(temporary_splits, splits)
        temporary_metadata.write_text(json.dumps(expected_metadata) + "\n")
        os.replace(temporary_features, features_path)
        os.replace(Path(f"{temporary_labels}.npy"), labels_path)
        os.replace(Path(f"{temporary_splits}.npy"), splits_path)
        os.replace(temporary_metadata, metadata_path)
        return {"features": np.load(features_path, mmap_mode="r"), "labels": np.load(labels_path, mmap_mode="r"), "splits": np.load(splits_path, mmap_mode="r")}
    except Exception as error:
        for temporary in [temporary_features, temporary_labels, temporary_splits, Path(f"{temporary_labels}.npy"), Path(f"{temporary_splits}.npy"), temporary_metadata]:
            try:
                temporary.unlink()
            except FileNotFoundError:
                pass
        print(json.dumps({"warning": "numeric embedding cache unavailable; using JSONL stream", "error": str(error)}), flush=True)
        return None


def batches(source, batch_size, label_to_index):
    if source is None or isinstance(source, (str, Path)):
        yield from jsonl_batches(source, batch_size, label_to_index)
        return
    features = source["features"]
    labels = source["labels"]
    splits = source["splits"]
    for start in range(0, len(features), batch_size):
        end = min(len(features), start + batch_size)
        yield features[start:end], labels[start:end], splits[start:end]


def split_indices(source, split_code):
    if not isinstance(source, dict):
        return None
    return np.flatnonzero(source["splits"] == split_code).astype(np.int64)


def normalize_embeddings(value):
    norms = mx.sqrt(mx.sum(value * value, axis=1, keepdims=True))
    return value / mx.maximum(norms, mx.array(1e-8, dtype=mx.float32))


def head_logits(features, head):
    return features @ head["weights"].T + head["bias"]


def prediction_rows(head, source, label_to_index, split, batch_size, eligible_labels):
    actual = []
    predicted = []
    margins = []
    excluded = 0
    target_split = SPLIT_CODES[split]
    for feature_rows, label_rows, split_rows in batches(source, batch_size, label_to_index):
        selected = np.flatnonzero(split_rows == target_split) if isinstance(split_rows, np.ndarray) else [index for index, value in enumerate(split_rows) if value == split]
        if not len(selected):
            continue
        retained = [index for index in selected if int(label_rows[index]) in eligible_labels]
        excluded += len(selected) - len(retained)
        if not retained:
            continue
        if isinstance(feature_rows, np.ndarray):
            selected_features = feature_rows[retained]
            selected_labels = label_rows[retained]
        else:
            selected_features = [feature_rows[index] for index in retained]
            selected_labels = [label_rows[index] for index in retained]
        features = normalize_embeddings(mx.array(selected_features, dtype=mx.float32))
        logits = head_logits(features, head)
        top = mx.argsort(logits, axis=1)[:, ::-1][:, :2]
        top_values = mx.take_along_axis(logits, top, axis=1)
        mx.eval(top, top_values)
        actual.extend(np.asarray(selected_labels, dtype=np.int32).tolist())
        predicted.extend(top[:, 0].tolist())
        margins.extend((top_values[:, 0] - top_values[:, 1]).tolist())
    return np.asarray(actual, dtype=np.int32), np.asarray(predicted, dtype=np.int32), np.asarray(margins, dtype=np.float32), excluded


def macro_f1(actual, predicted):
    confusion = defaultdict(lambda: [0, 0, 0])
    for truth, guess in zip(actual.tolist(), predicted.tolist()):
        if truth == guess:
            confusion[truth][0] += 1
        else:
            confusion[truth][1] += 1
            confusion[guess][2] += 1
    scores = []
    for true_positive, false_negative, false_positive in confusion.values():
        precision = true_positive / max(1, true_positive + false_positive)
        recall = true_positive / max(1, true_positive + false_negative)
        scores.append(2 * precision * recall / max(1e-9, precision + recall))
    return sum(scores) / max(1, len(scores))


def metrics_from_rows(rows, total_records, selective_margin=None):
    actual, predicted, margins, excluded = rows
    retained = len(actual)
    metrics = {
        "records": retained,
        "excludedRecords": excluded,
        "accuracy": float(np.mean(actual == predicted)) if retained else 0.0,
        "coverage": retained / max(1, total_records),
        "macroF1": float(macro_f1(actual, predicted)) if retained else 0.0,
    }
    if selective_margin is not None:
        selected = margins >= float(selective_margin)
        selected_count = int(selected.sum())
        metrics.update({
            "selectiveMargin": float(selective_margin),
            "selectiveRecords": selected_count,
            "selectiveAccuracy": float(np.mean(actual[selected] == predicted[selected])) if selected_count else 0.0,
            "selectiveCoverage": selected_count / max(1, retained),
            "selectiveMacroF1": float(macro_f1(actual[selected], predicted[selected])) if selected_count else 0.0,
        })
    return metrics


def choose_selective_margin(rows, min_accuracy, min_macro_f1, min_coverage, minimum_margin):
    actual, predicted, margins, excluded = rows
    if not len(actual):
        return None
    candidates = np.unique(np.quantile(margins, np.linspace(0.0, 0.995, 256)).astype(np.float32))
    candidates = np.unique(np.concatenate([candidates, np.asarray([0.0, 1.0, 1.5, 2.0, 2.5, 3.0], dtype=np.float32)]))
    candidates = candidates[candidates >= float(minimum_margin)]
    accepted = []
    for threshold in candidates.tolist():
        metrics = metrics_from_rows(rows, len(actual) + excluded, threshold)
        if metrics["selectiveAccuracy"] >= min_accuracy and metrics["selectiveMacroF1"] >= min_macro_f1 and metrics["selectiveCoverage"] >= min_coverage:
            accepted.append((metrics["selectiveCoverage"], -threshold, float(threshold)))
    if not accepted:
        return None
    accepted.sort(reverse=True)
    return accepted[0][2]


def clone_head(head):
    return {key: value for key, value in head.items()}


def main():
    if len(sys.argv) != 6 or sys.argv[5] != "--metal":
        raise SystemExit("usage: visual-taxonomy-train-mlx.py RECORDS_JSONL WEIGHTS_NPZ METRICS_JSON LABELS_JSON --metal")

    records_path, weights_arg, metrics_arg, labels_arg = sys.argv[1:5]
    weights_path = Path(weights_arg)
    metrics_path = Path(metrics_arg)
    labels_path = Path(labels_arg)
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
            if record["ruleId"] not in label_to_index or record["split"] not in SPLIT_CODES:
                raise SystemExit("embedding stream contains an unknown label or split")
            record_count += 1
            split_counts[record["split"]] += 1
            if record["split"] == "train":
                train_label_counts[record["ruleId"]] += 1
    if not dimension or not record_count or not all(split_counts[split] for split in ("train", "validation", "test")):
        raise SystemExit("train, validation, and test splits must all contain records")

    numeric_cache = build_numeric_cache(records_path, label_to_index, dimension, record_count)
    source = numeric_cache or records_path
    if numeric_cache:
        print(json.dumps({"numericEmbeddingCache": "ready", "records": record_count, "dimensions": dimension}), flush=True)

    try:
        mx.set_default_device(mx.gpu)
        mx.eval(mx.array([0], dtype=mx.float32))
    except Exception as error:
        raise SystemExit(f"Metal/MLX device unavailable: {error}")

    label_count = len(label_to_index)
    missing_train_labels = [rule_id for rule_id in label_to_index if not train_label_counts[rule_id]]
    missing_train_indices = {label_to_index[rule_id] for rule_id in missing_train_labels}
    eligible_labels = {label_to_index[rule_id] for rule_id in label_to_index if rule_id not in missing_train_labels}
    if missing_train_labels:
        print(json.dumps({"warning": "visual taxonomy labels without train examples are disabled for inference", "untrainedLabels": missing_train_labels, "count": len(missing_train_labels)}), flush=True)

    train_total = sum(train_label_counts.values())
    trained_label_count = max(1, len(eligible_labels))
    class_weight_power = float(os.environ.get("SALT_VISUAL_CLASS_WEIGHT_POWER", "0.5"))
    class_weight_max = max(1.0, float(os.environ.get("SALT_VISUAL_CLASS_WEIGHT_MAX", "6.0")))
    raw_class_weights = [(train_total / (trained_label_count * train_label_counts[entry["ruleId"]])) ** class_weight_power if train_label_counts[entry["ruleId"]] else 0.0 for entry in labels]
    raw_weight_mean = sum(raw_class_weights[index] * train_label_counts[entry["ruleId"]] for index, entry in enumerate(labels)) / max(1, train_total)
    class_weight_values = [min(class_weight_max, value / max(1e-9, raw_weight_mean)) if value else 0.0 for value in raw_class_weights]
    class_weights = mx.array(class_weight_values, dtype=mx.float32)

    centroid_sums = np.zeros((label_count, dimension), dtype=np.float64)
    for feature_rows, label_rows, split_rows in batches(source, 2048, label_to_index):
        selected = np.flatnonzero(split_rows == SPLIT_CODES["train"]) if isinstance(split_rows, np.ndarray) else [index for index, value in enumerate(split_rows) if value == "train"]
        if len(selected):
            rows = np.asarray(feature_rows[selected] if isinstance(feature_rows, np.ndarray) else [feature_rows[index] for index in selected], dtype=np.float32)
            rows /= np.maximum(np.linalg.norm(rows, axis=1, keepdims=True), 1e-8)
            values = np.asarray(label_rows[selected] if isinstance(label_rows, np.ndarray) else [label_rows[index] for index in selected], dtype=np.int32)
            np.add.at(centroid_sums, values, rows)
    centroid_weights = centroid_sums / np.maximum(np.linalg.norm(centroid_sums, axis=1, keepdims=True), 1e-8)
    centroid_logit_scale = float(os.environ.get("SALT_VISUAL_CENTROID_LOGIT_SCALE", "8.0"))
    head = {"weights": mx.array(centroid_weights, dtype=mx.float32) * centroid_logit_scale, "bias": mx.zeros((label_count,), dtype=mx.float32)}
    disabled_mask = mx.array([1.0 if index in missing_train_indices else 0.0 for index in range(label_count)], dtype=mx.float32)

    def disable_untrained(current):
        enabled = 1.0 - disabled_mask
        return {"weights": current["weights"] * enabled[:, None], "bias": current["bias"] * enabled - disabled_mask * 1_000_000.0}

    head = disable_untrained(head)
    eye = mx.eye(label_count, dtype=mx.float32)
    learning_rate = float(os.environ.get("SALT_VISUAL_TRAINING_LEARNING_RATE", "0.01"))
    epochs = max(1, int(os.environ.get("SALT_VISUAL_TRAINING_EPOCHS", "8")))
    batch_size = max(8, int(os.environ.get("SALT_VISUAL_TRAINING_BATCH_SIZE", "256")))
    shuffle_seed = int(os.environ.get("SALT_VISUAL_TRAINING_SHUFFLE_SEED", "17"))
    beta1 = float(os.environ.get("SALT_VISUAL_ADAM_BETA1", "0.9"))
    beta2 = float(os.environ.get("SALT_VISUAL_ADAM_BETA2", "0.999"))
    epsilon = float(os.environ.get("SALT_VISUAL_ADAM_EPSILON", "1e-8"))
    if not 0 < beta1 < 1 or not 0 < beta2 < 1 or epsilon <= 0:
        raise SystemExit("Adam beta values must be between 0 and 1 and epsilon must be positive")

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
    best_head = None
    stale_epochs = 0
    adam_step = 0
    first_moment_weights = mx.zeros_like(head["weights"])
    first_moment_bias = mx.zeros_like(head["bias"])
    second_moment_weights = mx.zeros_like(head["weights"])
    second_moment_bias = mx.zeros_like(head["bias"])

    if checkpoint_path and checkpoint_metadata_path and checkpoint_path.exists() and checkpoint_metadata_path.exists():
        try:
            metadata = json.loads(checkpoint_metadata_path.read_text())
            checks = {"manifestSha256": manifest_sha256, "featureTransform": FEATURE_TRANSFORM, "embeddingDimensions": dimension, "labelCount": label_count, "learningRate": learning_rate, "epochs": epochs, "batchSize": batch_size, "classWeightPower": class_weight_power, "classWeightMax": class_weight_max, "optimizer": "adam", "shuffleSeed": shuffle_seed}
            for key, expected in checks.items():
                if metadata.get(key) != expected:
                    raise SystemExit(f"training checkpoint {key} does not match the current run")
            start_epoch = int(metadata.get("completedEpoch", -1))
            if start_epoch < 0 or start_epoch > epochs:
                raise SystemExit("training checkpoint completed epoch is invalid")
            checkpoint = mx.load(str(checkpoint_path))
            if not {"weights", "bias", "bestWeights", "bestBias"}.issubset(checkpoint.keys()):
                raise SystemExit("training checkpoint is missing calibrated linear head weights")
            head = {"weights": mx.array(checkpoint["weights"], dtype=mx.float32), "bias": mx.array(checkpoint["bias"], dtype=mx.float32)}
            best_head = {"weights": mx.array(checkpoint["bestWeights"], dtype=mx.float32), "bias": mx.array(checkpoint["bestBias"], dtype=mx.float32)}
            if tuple(head["weights"].shape) != (label_count, dimension) or tuple(head["bias"].shape) != (label_count,):
                raise SystemExit("training checkpoint classifier shape does not match the current manifest")
            if {"firstMomentWeights", "firstMomentBias", "secondMomentWeights", "secondMomentBias"}.issubset(checkpoint.keys()):
                first_moment_weights = mx.array(checkpoint["firstMomentWeights"], dtype=mx.float32)
                first_moment_bias = mx.array(checkpoint["firstMomentBias"], dtype=mx.float32)
                second_moment_weights = mx.array(checkpoint["secondMomentWeights"], dtype=mx.float32)
                second_moment_bias = mx.array(checkpoint["secondMomentBias"], dtype=mx.float32)
                adam_step = int(metadata.get("adamStep", 0))
            best_epoch = int(metadata.get("bestEpoch", start_epoch))
            best_validation = metadata.get("bestValidation")
            stale_epochs = int(metadata.get("staleEpochs", 0))
            mx.eval(*head.values(), *best_head.values(), first_moment_weights, first_moment_bias, second_moment_weights, second_moment_bias)
            print(json.dumps({"resumedFromCheckpoint": str(checkpoint_path), "completedEpoch": start_epoch}), flush=True)
        except SystemExit:
            raise
        except Exception as error:
            raise SystemExit(f"could not validate training checkpoint: {error}")
    elif checkpoint_path and checkpoint_metadata_path and checkpoint_path.exists() != checkpoint_metadata_path.exists():
        raise SystemExit("training checkpoint is incomplete; refusing to resume")

    def save_training_checkpoint(completed_epoch):
        if not checkpoint_path or not checkpoint_metadata_path or best_head is None:
            return
        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        checkpoint_metadata_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_weights = checkpoint_path.with_name(f".{checkpoint_path.name}.tmp-{os.getpid()}.npz")
        temporary_metadata = checkpoint_metadata_path.with_name(f".{checkpoint_metadata_path.name}.tmp-{os.getpid()}")
        mx.savez(str(temporary_weights), weights=head["weights"].astype(mx.float16), bias=head["bias"].astype(mx.float16), bestWeights=best_head["weights"].astype(mx.float16), bestBias=best_head["bias"].astype(mx.float16), firstMomentWeights=first_moment_weights.astype(mx.float16), firstMomentBias=first_moment_bias.astype(mx.float16), secondMomentWeights=second_moment_weights.astype(mx.float16), secondMomentBias=second_moment_bias.astype(mx.float16))
        os.replace(temporary_weights, checkpoint_path)
        temporary_metadata.write_text(json.dumps({"manifestSha256": manifest_sha256, "featureTransform": FEATURE_TRANSFORM, "completedEpoch": completed_epoch, "embeddingDimensions": dimension, "labelCount": label_count, "learningRate": learning_rate, "epochs": epochs, "batchSize": batch_size, "bestEpoch": best_epoch, "bestValidation": best_validation, "staleEpochs": stale_epochs, "adamStep": adam_step, "optimizer": "adam", "shuffleSeed": shuffle_seed, "classWeightPower": class_weight_power, "classWeightMax": class_weight_max, "balancedSampling": False, "balanceTargetPerClass": 0, "headArchitecture": "calibrated-linear-v1", "selectiveMargin": best_validation.get("selectiveMargin") if isinstance(best_validation, dict) else None, "adamBeta1": beta1, "adamBeta2": beta2, "adamEpsilon": epsilon}, indent=2) + "\n")
        os.replace(temporary_metadata, checkpoint_metadata_path)

    def loss_fn(current_weights, current_bias, features, targets):
        logits = head_logits(features, {"weights": current_weights, "bias": current_bias})
        log_probs = logits - mx.logsumexp(logits, axis=1, keepdims=True)
        return -mx.mean(class_weights[targets] * mx.sum(eye[targets] * log_probs, axis=1))

    value_and_grad = mx.value_and_grad(loss_fn, argnums=(0, 1))
    train_indices = split_indices(source, SPLIT_CODES["train"])
    shuffle_rng = np.random.default_rng(shuffle_seed)
    patience = max(1, int(os.environ.get("SALT_VISUAL_TRAINING_EARLY_STOP_PATIENCE", "2")))
    if best_head is None:
        initial_rows = prediction_rows(head, source, label_to_index, "validation", batch_size, eligible_labels)
        best_validation = metrics_from_rows(initial_rows, split_counts["validation"])
        best_epoch = 0
        best_head = clone_head(head)

    for epoch in range(start_epoch, epochs):
        if train_indices is not None:
            epoch_indices = train_indices.copy()
            shuffle_rng.shuffle(epoch_indices)
            iterator = ((source["features"][indices], source["labels"][indices]) for indices in (epoch_indices[start:start + batch_size] for start in range(0, len(epoch_indices), batch_size)))
        else:
            iterator = (([feature_rows[index] for index in selected], [label_rows[index] for index in selected]) for feature_rows, label_rows, split_rows in batches(source, batch_size, label_to_index) for selected in [[index for index, value in enumerate(split_rows) if value == "train"]] if selected)
        last_loss = None
        for selected_features, selected_labels in iterator:
            features = normalize_embeddings(mx.array(selected_features, dtype=mx.float32))
            targets = mx.array(selected_labels, dtype=mx.int32)
            loss, gradients = value_and_grad(head["weights"], head["bias"], features, targets)
            adam_step += 1
            first_moment_weights = beta1 * first_moment_weights + (1 - beta1) * gradients[0]
            first_moment_bias = beta1 * first_moment_bias + (1 - beta1) * gradients[1]
            second_moment_weights = beta2 * second_moment_weights + (1 - beta2) * gradients[0] * gradients[0]
            second_moment_bias = beta2 * second_moment_bias + (1 - beta2) * gradients[1] * gradients[1]
            correction_1 = 1 - beta1 ** adam_step
            correction_2 = 1 - beta2 ** adam_step
            corrected_weights = (first_moment_weights / correction_1) / (mx.sqrt(second_moment_weights / correction_2) + epsilon)
            corrected_bias = (first_moment_bias / correction_1) / (mx.sqrt(second_moment_bias / correction_2) + epsilon)
            head = disable_untrained({"weights": head["weights"] - learning_rate * corrected_weights, "bias": head["bias"] - learning_rate * corrected_bias})
            mx.eval(head["weights"], head["bias"], first_moment_weights, first_moment_bias, second_moment_weights, second_moment_bias, loss)
            last_loss = float(loss.item())
        validation_rows = prediction_rows(head, source, label_to_index, "validation", batch_size, eligible_labels)
        validation = metrics_from_rows(validation_rows, split_counts["validation"])
        if best_validation is None or (validation["macroF1"], validation["accuracy"]) > (float(best_validation.get("macroF1", -1)), float(best_validation.get("accuracy", -1))):
            best_validation = validation
            best_epoch = epoch + 1
            best_head = clone_head(head)
            stale_epochs = 0
        else:
            stale_epochs += 1
        save_training_checkpoint(epoch + 1)
        print(json.dumps({"epoch": epoch + 1, "epochs": epochs, "loss": last_loss, "validation": validation, "bestEpoch": best_epoch}), flush=True)
        if stale_epochs >= patience:
            break

    validation_rows = prediction_rows(best_head, source, label_to_index, "validation", batch_size, eligible_labels)
    test_rows = prediction_rows(best_head, source, label_to_index, "test", batch_size, eligible_labels)
    train_rows = prediction_rows(best_head, source, label_to_index, "train", batch_size, eligible_labels)
    min_validation_accuracy = float(os.environ.get("SALT_VISUAL_MIN_VALIDATION_SELECTIVE_ACCURACY", os.environ.get("SALT_VISUAL_MIN_TEST_ACCURACY", "0.85")))
    min_test_accuracy = float(os.environ.get("SALT_VISUAL_MIN_TEST_SELECTIVE_ACCURACY", os.environ.get("SALT_VISUAL_MIN_TEST_ACCURACY", "0.85")))
    min_validation_macro_f1 = float(os.environ.get("SALT_VISUAL_MIN_VALIDATION_SELECTIVE_MACRO_F1", os.environ.get("SALT_VISUAL_MIN_VALIDATION_MACRO_F1", "0.55")))
    min_test_macro_f1 = float(os.environ.get("SALT_VISUAL_MIN_TEST_SELECTIVE_MACRO_F1", os.environ.get("SALT_VISUAL_MIN_TEST_MACRO_F1", "0.55")))
    min_validation_coverage = float(os.environ.get("SALT_VISUAL_MIN_VALIDATION_SELECTIVE_COVERAGE", "0.40"))
    min_test_coverage = float(os.environ.get("SALT_VISUAL_MIN_TEST_SELECTIVE_COVERAGE", "0.40"))
    minimum_margin = float(os.environ.get("SALT_VISUAL_MIN_SELECTIVE_MARGIN", "2.0"))
    selective_margin = choose_selective_margin(validation_rows, min_validation_accuracy, min_validation_macro_f1, min_validation_coverage, minimum_margin)
    if selective_margin is None:
        selective_margin = float(os.environ.get("SALT_VISUAL_SELECTIVE_MARGIN", "2.0"))
    validation = metrics_from_rows(validation_rows, split_counts["validation"], selective_margin)
    test = metrics_from_rows(test_rows, split_counts["test"], selective_margin)
    train = metrics_from_rows(train_rows, split_counts["train"], selective_margin)
    quality_gate = {"passed": validation["selectiveAccuracy"] >= min_validation_accuracy and validation["selectiveMacroF1"] >= min_validation_macro_f1 and validation["selectiveCoverage"] >= min_validation_coverage and test["selectiveAccuracy"] >= min_test_accuracy and test["selectiveMacroF1"] >= min_test_macro_f1 and test["selectiveCoverage"] >= min_test_coverage, "decisionMode": "selective-high-margin-only", "minimumValidationSelectiveAccuracy": min_validation_accuracy, "minimumTestSelectiveAccuracy": min_test_accuracy, "minimumValidationSelectiveMacroF1": min_validation_macro_f1, "minimumTestSelectiveMacroF1": min_test_macro_f1, "minimumValidationSelectiveCoverage": min_validation_coverage, "minimumTestSelectiveCoverage": min_test_coverage, "minimumSelectiveMargin": minimum_margin, "selectiveMargin": selective_margin, "bestEpoch": best_epoch}
    if not quality_gate["passed"]:
        raise SystemExit(json.dumps({"error": "visual taxonomy quality gate failed", "validation": validation, "test": test, "qualityGate": quality_gate}))

    weights_path.parent.mkdir(parents=True, exist_ok=True)
    mx.savez(str(weights_path), weights=best_head["weights"].astype(mx.float16), bias=best_head["bias"].astype(mx.float16), selectiveMargin=mx.array([selective_margin], dtype=mx.float16))
    mx.eval(best_head["weights"], best_head["bias"])
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.write_text(json.dumps({"backend": "mlx-metal", "device": "metal", "precision": "float16", "featureTransform": FEATURE_TRANSFORM, "epochs": epochs, "epochsCompleted": max(start_epoch, best_epoch), "earlyStopped": stale_epochs >= patience, "batchSize": batch_size, "classBalanced": False, "headArchitecture": "calibrated-linear-v1", "optimizer": "adam", "shuffleSeed": shuffle_seed, "classWeightPower": class_weight_power, "classWeightMax": class_weight_max, "classWeights": class_weight_values, "trainLabelCounts": {entry["ruleId"]: train_label_counts[entry["ruleId"]] for entry in labels}, "trainedLabelCount": trained_label_count, "untrainedLabels": missing_train_labels, "selectiveDecisionPolicy": {"margin": selective_margin, "lowMarginAction": "classification-review-fallback"}, "metrics": {"train": train, "validation": validation, "test": test, "qualityGate": quality_gate}, "records": record_count, "embeddingDimensions": dimension}, indent=2) + "\n")


if __name__ == "__main__":
    main()
