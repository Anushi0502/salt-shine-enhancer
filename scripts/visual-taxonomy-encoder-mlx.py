#!/usr/bin/env python3
"""Metal image encoder and lightweight supervised visual adapter.

The SigLIP backbone stays frozen. A trainable projection adapter is learned
over streamed product images, then applied during encoding. This keeps GPU
memory bounded while still producing a real fine-tuned encoder checkpoint
that the Node release trainer can checksum and verify.
"""

import hashlib
import json
import os
import sys
import time
from pathlib import Path

import mlx.core as mx
import numpy as np


def require_metal():
    mx.set_default_device(mx.gpu)
    if mx.default_device() != mx.gpu:
        raise SystemExit(f"Metal/MLX device unavailable: {mx.default_device()}")
    mx.eval(mx.array([0], dtype=mx.float32))


def sha256_file(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path):
    try:
        return json.loads(path.read_text())
    except Exception as error:
        raise SystemExit(f"Could not read JSON {path}: {error}") from error


def read_jsonl(path: Path):
    entries = []
    with path.open() as handle:
        for line_number, line in enumerate(handle, 1):
            if not line.strip():
                continue
            try:
                entries.append(json.loads(line))
            except Exception as error:
                raise SystemExit(f"Invalid JSONL at {path}:{line_number}: {error}") from error
    return entries


def model_path_from_checkpoint(checkpoint_path: Path):
    manifest = read_json(checkpoint_path)
    if manifest.get("kind") != "salt-visual-base-checkpoint":
        raise SystemExit(f"Base checkpoint is not a SALT visual checkpoint manifest: {checkpoint_path}")
    model_path = Path(str(manifest.get("modelPath", ""))).expanduser()
    if not model_path.is_dir():
        raise SystemExit(f"SigLIP MLX model directory does not exist: {model_path}")
    return model_path


def load_backbone(checkpoint_path: Path):
    from mlx_embeddings import load, generate

    model_path = model_path_from_checkpoint(checkpoint_path)
    model, processor = load(str(model_path), lazy=True)
    return model, processor, generate


def load_adapter_checkpoint(checkpoint_path: Path):
    """Load MLX arrays even when the atomic shard path has no .npz suffix."""
    try:
        with np.load(checkpoint_path, allow_pickle=False) as archive:
            return {name: mx.array(archive[name]) for name in archive.files}
    except Exception as error:
        raise SystemExit(f"Could not load encoder checkpoint {checkpoint_path}: {error}") from error


def batches(entries, batch_size):
    for start in range(0, len(entries), batch_size):
        yield entries[start:start + batch_size]


def image_path(dataset_path: Path, entry):
    path = dataset_path / str(entry.get("image", ""))
    if not path.is_file():
        raise SystemExit(f"Encoded image is missing from the staged corpus: {path}")
    return path


def image_embeddings(model, processor, generate, paths):
    output = generate(model, processor, texts=["a retail product"] * len(paths), images=[str(path) for path in paths])
    embeddings = output.image_embeds
    if embeddings is None or len(embeddings.shape) != 2:
        raise SystemExit("SigLIP did not return a two-dimensional image embedding batch")
    mx.eval(embeddings)
    return embeddings.astype(mx.float32)


def save_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def resume_embedding_records(path: Path, entries):
    """Return the verified prefix of a stable partial embedding output."""
    if not path.is_file():
        return 0
    count = 0
    try:
        with path.open() as handle:
            for line_number, line in enumerate(handle, 1):
                if not line.strip():
                    continue
                record = json.loads(line)
                if count >= len(entries) or record.get("imageSha256") != entries[count].get("imageSha256"):
                    raise ValueError(f"partial embedding order mismatch at record {line_number}")
                count += 1
    except (OSError, ValueError, json.JSONDecodeError):
        path.unlink(missing_ok=True)
        return 0
    if count < len(entries) and count % max(1, int(os.environ.get("SALT_VISUAL_ENCODER_BATCH_SIZE", "16"))) != 0:
        path.unlink(missing_ok=True)
        return 0
    return count


def fine_tune(manifest_path: Path, dataset_path: Path, labels_path: Path, base_checkpoint: Path, output_path: Path):
    require_metal()
    model, processor, generate = load_backbone(base_checkpoint)
    entries = read_jsonl(manifest_path)
    labels = read_json(labels_path)
    label_to_index = {str(entry["ruleId"]): int(entry["index"]) for entry in labels}
    if len(label_to_index) < 2:
        raise SystemExit("At least two visual taxonomy labels are required for adapter training")
    if not entries:
        raise SystemExit("The visual encoder training manifest is empty")

    # Keep the default large enough to use Metal efficiently while allowing a
    # smaller value when a machine has less unified memory.
    batch_size = max(1, int(os.environ.get("SALT_VISUAL_ENCODER_BATCH_SIZE", "16")))
    epochs = max(1, int(os.environ.get("SALT_VISUAL_ENCODER_TRAINING_EPOCHS", "1")))
    learning_rate = float(os.environ.get("SALT_VISUAL_ENCODER_LEARNING_RATE", "0.01"))
    progress_raw = os.environ.get("SALT_VISUAL_TRAINING_PROGRESS_PATH", "").strip()
    progress_path = Path(progress_raw).expanduser() if progress_raw else None
    partial_raw = os.environ.get("SALT_VISUAL_ENCODER_PARTIAL_CHECKPOINT", "").strip()
    partial_path = Path(partial_raw).expanduser() if partial_raw else None
    partial_metadata_path = partial_path.with_name(f"{partial_path.name}.json") if partial_path else None
    total_steps = ((len(entries) + batch_size - 1) // batch_size) * epochs
    try:
        steps = max(0, int(os.environ.get("SALT_VISUAL_ENCODER_RESUME_STEPS", "0")))
        entries_processed = max(0, int(os.environ.get("SALT_VISUAL_ENCODER_RESUME_ENTRIES_PROCESSED", "0")))
    except ValueError as error:
        raise SystemExit(f"Invalid visual encoder resume progress: {error}") from error
    last_loss = None

    def update_progress(status, **details):
        if progress_path is None:
            return
        save_json(progress_path, {
            "status": status,
            "device": "metal",
            "shard": os.environ.get("SALT_VISUAL_TRAINING_SHARD_ID", ""),
            "steps": steps,
            "totalSteps": total_steps,
            "entriesProcessed": entries_processed,
            "totalEntries": len(entries) * epochs,
            "batchSize": batch_size,
            "epochs": epochs,
            "updatedAt": time.time(),
            **details,
        })

    update_progress("training", phase="fine-tune", startedAt=time.time())
    first_batch = entries[:batch_size]
    first_embeddings = image_embeddings(model, processor, generate, [image_path(dataset_path, entry) for entry in first_batch])
    dimension = int(first_embeddings.shape[-1])
    label_count = len(label_to_index)
    weights = mx.eye(dimension, dtype=mx.float32) + mx.random.normal((dimension, dimension), dtype=mx.float32) * 0.001
    projection_bias = mx.zeros((dimension,), dtype=mx.float32)
    classifier = mx.random.normal((label_count, dimension), dtype=mx.float32) * 0.01
    classifier_bias = mx.zeros((label_count,), dtype=mx.float32)
    resume_raw = os.environ.get("SALT_VISUAL_ENCODER_RESUME_CHECKPOINT", "").strip()
    if resume_raw:
        resume_path = Path(resume_raw).expanduser()
        if not resume_path.is_file():
            raise SystemExit(f"The encoder resume checkpoint does not exist: {resume_path}")
        try:
            resume = load_adapter_checkpoint(resume_path)
            required = {"projection", "projectionBias", "classifier", "classifierBias"}
            missing = sorted(required.difference(resume.keys()))
            if missing:
                raise SystemExit(f"The encoder resume checkpoint is missing: {', '.join(missing)}")
            weights = mx.array(resume["projection"], dtype=mx.float32)
            projection_bias = mx.array(resume["projectionBias"], dtype=mx.float32)
            classifier = mx.array(resume["classifier"], dtype=mx.float32)
            classifier_bias = mx.array(resume["classifierBias"], dtype=mx.float32)
            if tuple(weights.shape) != (dimension, dimension):
                raise SystemExit("The encoder resume projection shape does not match the current embeddings")
            if tuple(projection_bias.shape) != (dimension,):
                raise SystemExit("The encoder resume projection bias shape does not match the current embeddings")
            if tuple(classifier.shape) != (label_count, dimension) or tuple(classifier_bias.shape) != (label_count,):
                raise SystemExit("The encoder resume classifier shape does not match the global taxonomy labels")
            print(json.dumps({"resumedFromCheckpoint": str(resume_path), "device": "metal"}), flush=True)
        except SystemExit:
            raise
        except Exception as error:
            raise SystemExit(f"Could not load encoder resume checkpoint: {error}") from error
    eye = mx.eye(label_count, dtype=mx.float32)

    def loss_fn(current_weights, current_projection_bias, current_classifier, current_classifier_bias, x, y):
        projected = x @ current_weights.T + current_projection_bias
        logits = projected @ current_classifier.T + current_classifier_bias
        log_probs = logits - mx.logsumexp(logits, axis=1, keepdims=True)
        return -mx.mean(mx.sum(eye[y] * log_probs, axis=1))

    def step(current_weights, current_projection_bias, current_classifier, current_classifier_bias, x, y):
        loss, gradients = mx.value_and_grad(loss_fn, argnums=(0, 1, 2, 3))(
            current_weights,
            current_projection_bias,
            current_classifier,
            current_classifier_bias,
            x,
            y,
        )
        return (
            current_weights - learning_rate * gradients[0],
            current_projection_bias - learning_rate * gradients[1],
            current_classifier - learning_rate * gradients[2],
            current_classifier_bias - learning_rate * gradients[3],
            loss,
        )

    def save_partial_checkpoint(epoch, loss_value):
        if partial_path is None or partial_metadata_path is None:
            return
        partial_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = partial_path.with_name(f".{partial_path.name}.tmp-{os.getpid()}.npz")
        mx.savez(
            str(temporary),
            projection=weights.astype(mx.float16),
            projectionBias=projection_bias.astype(mx.float16),
            classifier=classifier.astype(mx.float16),
            classifierBias=classifier_bias.astype(mx.float16),
        )
        temporary.replace(partial_path)
        save_json(partial_metadata_path, {
            "kind": "salt-visual-fine-tuned-encoder-partial",
            "device": "metal",
            "manifestSha256": os.environ.get("SALT_VISUAL_TRAINING_MANIFEST_SHA256", ""),
            "baseCheckpointPath": str(base_checkpoint),
            "steps": steps,
            "entriesProcessed": entries_processed,
            "totalEntries": len(entries) * epochs,
            "epoch": epoch + 1,
            "loss": loss_value,
            "checkpointPath": str(partial_path),
            "updatedAt": time.time(),
        })

    for epoch in range(epochs):
        for batch_start in range(0, len(entries), batch_size):
            global_batch_start = epoch * len(entries) + batch_start
            if global_batch_start < entries_processed:
                continue
            batch = entries[batch_start:batch_start + batch_size]
            paths = [image_path(dataset_path, entry) for entry in batch]
            x = image_embeddings(model, processor, generate, paths)
            y_values = [label_to_index[str(entry["ruleId"])] for entry in batch]
            y = mx.array(y_values, dtype=mx.int32)
            weights, projection_bias, classifier, classifier_bias, loss = step(
                weights, projection_bias, classifier, classifier_bias, x, y
            )
            mx.eval(weights, projection_bias, classifier, classifier_bias, loss)
            steps += 1
            entries_processed = global_batch_start + len(batch)
            last_loss = float(loss.item())
            if steps == 1 or steps % 25 == 0:
                update_progress("training", epoch=epoch + 1, loss=last_loss)
            if steps % 250 == 0 or entries_processed == len(entries) * epochs:
                save_partial_checkpoint(epoch, last_loss)
            if steps % 100 == 0 or steps == 1:
                print(json.dumps({"epoch": epoch + 1, "epochs": epochs, "steps": steps, "loss": last_loss}), flush=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    # MLX appends .npz when the temporary filename has no archive suffix. Keep
    # the suffix on the temp path so the atomic replace targets the file MLX
    # actually created, while preserving the caller's final checkpoint name.
    temporary = output_path.with_name(f".{output_path.name}.tmp-{os.getpid()}.npz")
    mx.savez(
        str(temporary),
        projection=weights.astype(mx.float16),
        projectionBias=projection_bias.astype(mx.float16),
        classifier=classifier.astype(mx.float16),
        classifierBias=classifier_bias.astype(mx.float16),
    )
    temporary.replace(output_path)
    output_digest = sha256_file(output_path)
    base_digest = sha256_file(base_checkpoint)
    save_json(output_path.with_name(f"{output_path.name}.json"), {
        "kind": "salt-visual-fine-tuned-encoder",
        "adapterType": "siglip-linear-projection",
        "baseCheckpointPath": str(base_checkpoint),
        "baseCheckpointSha256": base_digest,
        "outputCheckpointSha256": output_digest,
        "embeddingDimensions": dimension,
        "labelCount": label_count,
        "steps": steps,
        "epochs": epochs,
        "device": "metal",
    })
    save_json(output_path.with_name(f"{output_path.name}.training.json"), {
        "fineTuned": True,
        "device": "metal",
        "steps": steps,
        "datasetManifestSha256": os.environ.get("SALT_VISUAL_TRAINING_MANIFEST_SHA256", ""),
        "baseCheckpointSha256": base_digest,
        "outputCheckpointSha256": output_digest,
        "adapterType": "siglip-linear-projection",
        "embeddingDimensions": dimension,
        "labelCount": label_count,
    })
    if partial_path is not None:
        partial_path.unlink(missing_ok=True)
    if partial_metadata_path is not None:
        partial_metadata_path.unlink(missing_ok=True)
    update_progress("completed", phase="fine-tune", completedAt=time.time(), loss=last_loss)


def encode(manifest_path: Path, dataset_path: Path, embeddings_path: Path):
    require_metal()
    base_checkpoint = Path(os.environ.get("SALT_VISUAL_BASE_CHECKPOINT", "")).expanduser()
    adapter_path = base_checkpoint
    if not adapter_path.is_file():
        raise SystemExit("SALT_VISUAL_BASE_CHECKPOINT must point to the fine-tuned adapter checkpoint during encoding")
    adapter_metadata = read_json(adapter_path.with_name(f"{adapter_path.name}.json"))
    base_checkpoint = Path(str(adapter_metadata.get("baseCheckpointPath", ""))).expanduser()
    model, processor, generate = load_backbone(base_checkpoint)
    adapter = load_adapter_checkpoint(adapter_path)
    projection = mx.array(adapter["projection"], dtype=mx.float32)
    projection_bias = mx.array(adapter["projectionBias"], dtype=mx.float32)
    entries = read_jsonl(manifest_path)
    # Keep encode throughput aligned with fine-tuning; callers can lower this
    # through the environment if unified-memory pressure requires it.
    batch_size = max(1, int(os.environ.get("SALT_VISUAL_ENCODER_BATCH_SIZE", "16")))
    progress_raw = os.environ.get("SALT_VISUAL_TRAINING_PROGRESS_PATH", "").strip()
    progress_path = Path(progress_raw).expanduser() if progress_raw else None
    total_records = len(entries)
    partial_path = embeddings_path.with_name(f".{embeddings_path.name}.partial")
    records_written = resume_embedding_records(partial_path, entries)

    def update_progress(status, **details):
        if progress_path is None:
            return
        save_json(progress_path, {
            "status": status,
            "device": "metal",
            "phase": "embedding-encoding",
            "shard": os.environ.get("SALT_VISUAL_TRAINING_SHARD_ID", ""),
            "recordsWritten": records_written,
            "totalRecords": total_records,
            "batchSize": batch_size,
            "updatedAt": time.time(),
            **details,
        })

    embeddings_path.parent.mkdir(parents=True, exist_ok=True)
    update_progress("encoding", startedAt=time.time(), resumedRecords=records_written)
    with partial_path.open("a" if records_written else "w") as output:
        for batch_index, batch_start in enumerate(range(records_written, total_records, batch_size), start=records_written // batch_size):
            batch = entries[batch_start:batch_start + batch_size]
            x = image_embeddings(model, processor, generate, [image_path(dataset_path, entry) for entry in batch])
            projected = x @ projection.T + projection_bias
            mx.eval(projected)
            for entry, embedding in zip(batch, projected.tolist()):
                output.write(json.dumps({
                    "imageSha256": entry["imageSha256"],
                    "productId": entry["productId"],
                    "ruleId": entry["ruleId"],
                    "split": entry["split"],
                    "embedding": [float(value) for value in embedding],
                }) + "\n")
            records_written += len(batch)
            if batch_index == 0 or batch_index % 10 == 0 or records_written == total_records:
                output.flush()
                update_progress("encoding", batch=batch_index + 1)
    partial_path.replace(embeddings_path)
    update_progress("completed", completedAt=time.time())
    print(json.dumps({"records": len(entries), "embeddingDimensions": int(projection.shape[0]), "device": "metal"}), flush=True)


def smoke(checkpoint_path: Path, image_path: Path):
    """Verify that a base MLX checkpoint can execute one real image on Metal."""
    require_metal()
    if not image_path.is_file():
        raise SystemExit(f"Smoke-test image does not exist: {image_path}")
    model, processor, generate = load_backbone(checkpoint_path)
    embeddings = image_embeddings(model, processor, generate, [image_path])
    print(json.dumps({
        "records": 1,
        "embeddingDimensions": int(embeddings.shape[-1]),
        "device": "metal",
        "checkpoint": str(checkpoint_path),
        "image": str(image_path),
    }), flush=True)


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in {"fine-tune", "encode", "smoke"}:
        raise SystemExit("usage: visual-taxonomy-encoder-mlx.py fine-tune|encode|smoke ...")
    if sys.argv[1] == "fine-tune" and len(sys.argv) == 7:
        fine_tune(*(Path(value) for value in sys.argv[2:]))
        return
    if sys.argv[1] == "encode" and len(sys.argv) == 5:
        encode(*(Path(value) for value in sys.argv[2:]))
        return
    if sys.argv[1] == "smoke" and len(sys.argv) == 4:
        smoke(*(Path(value) for value in sys.argv[2:]))
        return
    raise SystemExit("usage: fine-tune MANIFEST DATASET LABELS BASE_CHECKPOINT OUTPUT_CHECKPOINT | encode MANIFEST DATASET EMBEDDINGS | smoke BASE_CHECKPOINT IMAGE")


if __name__ == "__main__":
    main()
