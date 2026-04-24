#!/usr/bin/env python3
"""
ASU Sol GPU inference script for H8 Labeling.

Downloads images from GCS, runs YOLO OBB inference on an A100 GPU,
and posts predictions back to the web app automatically.

Usage (interactive):
    python3 sol_infer.py \
      --batch-id 1 \
      --api-url http://165.22.151.113/api \
      --api-token YOUR_JWT_TOKEN \
      --model-path /path/to/best.pt \
      --gcs-bucket h8-labeling-data2 \
      --gcs-key /path/to/gcs-key.json

Usage (SLURM sbatch):
    sbatch --partition=htc --gres=gpu:1 --time=04:00:00 \
           --wrap="python3 sol_infer.py --batch-id 1 ..."

Dependencies (install once on Sol):
    pip install ultralytics google-cloud-storage requests pillow
"""
import argparse
import math
import os
import sys
import tempfile

import requests
from PIL import Image as PILImage


def parse_args():
    p = argparse.ArgumentParser(description="Sol GPU inference for H8 Labeling")
    p.add_argument("--batch-id", type=int, required=True,
                   help="Batch ID shown in the web app")
    p.add_argument("--api-url", required=True,
                   help="Web app API base URL, e.g. http://165.22.151.113/api")
    p.add_argument("--api-token", required=True,
                   help="Lead user JWT token (copy from browser: open DevTools → Application → Local Storage → token)")
    p.add_argument("--model-path", default="best.pt",
                   help="Path to YOLO .pt weights file on Sol")
    p.add_argument("--gcs-bucket", required=True,
                   help="GCS bucket name, e.g. h8-labeling-data2")
    p.add_argument("--gcs-key", default=None,
                   help="Path to GCS service account JSON key (omit if ADC is configured)")
    p.add_argument("--device", default="0",
                   help="CUDA device index (default: 0)")
    return p.parse_args()


def main():
    args = parse_args()
    api = args.api_url.rstrip("/")
    headers = {"Authorization": f"Bearer {args.api_token}"}

    # ── 1. Fetch image list ──────────────────────────────────────────────────
    print(f"Fetching images for batch {args.batch_id} from {api} ...")
    resp = requests.get(f"{api}/images/batches/{args.batch_id}", headers=headers, timeout=30)
    if not resp.ok:
        print(f"ERROR: {resp.status_code} {resp.text}", file=sys.stderr)
        sys.exit(1)

    all_images = resp.json()
    images = [img for img in all_images if img["status"] == "uploaded"]
    if not images:
        print("No uploaded images found — nothing to process.")
        sys.exit(0)
    print(f"Found {len(images)} images to process.\n")

    # ── 2. Sync model weights from server ────────────────────────────────────
    print(f"Checking for latest model weights from {api} ...")
    try:
        weight_resp = requests.get(
            f"{api}/models/download",
            headers=headers,
            timeout=120,
            stream=True,
        )
        if weight_resp.ok:
            tmp_weights = args.model_path + ".download"
            with open(tmp_weights, "wb") as wf:
                for chunk in weight_resp.iter_content(chunk_size=8192):
                    wf.write(chunk)
            os.replace(tmp_weights, args.model_path)
            size_mb = round(os.path.getsize(args.model_path) / 1024 / 1024, 1)
            print(f"Weights synced ({size_mb} MB) → {args.model_path}")
        else:
            print(f"WARNING: could not sync weights ({weight_resp.status_code}), using existing file")
    except Exception as e:
        print(f"WARNING: weight sync failed ({e}), using existing file")

    # ── 3. Load YOLO model ───────────────────────────────────────────────────
    from ultralytics import YOLO
    import torch
    print(f"Loading model from {args.model_path} on cuda:{args.device} ...")
    if not os.path.exists(args.model_path):
        print(f"ERROR: model file not found: {args.model_path}", file=sys.stderr)
        sys.exit(1)
    torch.serialization.add_safe_globals([])  # allow all for YOLO OBB models
    model = YOLO(args.model_path)
    model.to(f"cuda:{args.device}")
    print("Model ready.\n")

    # ── 4. GCS client ───────────────────────────────────────────────────────
    from google.cloud import storage as gcs_lib
    if args.gcs_key:
        gcs_client = gcs_lib.Client.from_service_account_json(args.gcs_key)
    else:
        gcs_client = gcs_lib.Client()
    bucket = gcs_client.bucket(args.gcs_bucket)

    # ── 5. Inference loop ───────────────────────────────────────────────────
    success, failed = 0, 0

    for i, img_data in enumerate(images, 1):
        image_id = img_data["id"]
        storage_url = img_data.get("storage_url") or ""
        print(f"[{i}/{len(images)}] image_id={image_id} ...", end=" ", flush=True)

        ext = ".jpg"
        if storage_url.startswith("gcs://"):
            ext = os.path.splitext(storage_url)[1] or ".jpg"

        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp_path = tmp.name

        try:
            if storage_url.startswith("gcs://"):
                blob_name = storage_url[len("gcs://"):]
                bucket.blob(blob_name).download_to_filename(tmp_path)
            else:
                # Download local images through the API
                img_resp = requests.get(
                    f"{api}/images/{image_id}/file",
                    headers=headers,
                    timeout=60,
                    stream=True,
                )
                img_resp.raise_for_status()
                with open(tmp_path, "wb") as f:
                    for chunk in img_resp.iter_content(chunk_size=8192):
                        f.write(chunk)

            pil_img = PILImage.open(tmp_path)
            img_w, img_h = pil_img.size

            results = model(tmp_path, verbose=False)
            predictions = []

            for result in results:
                if result.obb is None:
                    continue
                for j in range(len(result.obb)):
                    cls_idx = int(result.obb.cls[j].item())
                    cx_px, cy_px, w_px, h_px, angle_rad = result.obb.xywhr[j].tolist()
                    predictions.append({
                        "class_name": result.names[cls_idx],
                        "cx": cx_px / img_w,
                        "cy": cy_px / img_h,
                        "w": w_px / img_w,
                        "h": h_px / img_h,
                        "angle": math.degrees(angle_rad),
                        "confidence": float(result.obb.conf[j].item()),
                    })

            post = requests.post(
                f"{api}/images/{image_id}/predictions",
                headers=headers,
                json=predictions,
                timeout=30,
            )
            if post.ok:
                print(f"✓  {len(predictions)} boxes")
                success += 1
            else:
                print(f"✗  API {post.status_code}: {post.text[:100]}")
                failed += 1

        except Exception as exc:
            print(f"✗  {exc}")
            failed += 1
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    # ── 6. Finalize batch ───────────────────────────────────────────────────
    print(f"\nFinalizing batch {args.batch_id} ...")
    fin = requests.post(
        f"{api}/batches/{args.batch_id}/finalize-sol",
        headers=headers,
        timeout=30,
    )
    if fin.ok:
        print("Batch status set to done. ✓")
    else:
        print(f"WARNING: could not finalize batch: {fin.text}", file=sys.stderr)

    print(f"\n{'='*40}")
    print(f"Done — {success} succeeded, {failed} failed out of {len(images)} images.")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
