# H8 Labeling — User Documentation

**Version:** 1.0  
**Platform:** https://h8labeling.com  
**Last Updated:** April 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Getting Started](#2-getting-started)
3. [Lead Guide](#3-lead-guide)
   - [Creating a Batch](#31-creating-a-batch)
   - [Uploading Images](#32-uploading-images)
   - [Linking a GCS Folder](#33-linking-a-gcs-folder)
   - [Running Inferences](#34-running-inferences)
   - [Starting from Scratch](#35-starting-from-scratch)
   - [Managing Classes](#36-managing-classes)
   - [Assigning Tasks to Annotators](#37-assigning-tasks-to-annotators)
   - [Exporting Annotations to GCS](#38-exporting-annotations-to-gcs)
   - [Model Management](#39-model-management)
4. [Annotator Guide](#4-annotator-guide)
   - [Accepting an Invite](#41-accepting-an-invite)
   - [Opening a Task](#42-opening-a-task)
   - [Using the Annotation Canvas](#43-using-the-annotation-canvas)
   - [Submitting Annotations](#44-submitting-annotations)
5. [Sol GPU Setup](#5-sol-gpu-setup)
6. [FAQ & Troubleshooting](#6-faq--troubleshooting)

---

## 1. Overview

**H8 Labeling** is a collaborative Oriented Bounding Box (OBB) annotation platform designed for part-based XAI (Explainable AI) image labeling. It is built for teams working on drone image datasets where precise part-level annotations are required.

### How It Works

The platform follows a three-step workflow:

```
Upload Images → Run Inference → Human Review & Annotation → Export
```

1. The **lead** uploads a batch of images and runs a YOLOv11 OBB model to automatically generate bounding box predictions.
2. The lead assigns images to **annotators**, who inspect and correct the predicted boxes on an interactive canvas.
3. The lead exports the finalized annotations in YOLO OBB format (images + labels + data.yaml) back to Google Cloud Storage for model retraining.

### Roles

| Role | Capabilities |
|------|-------------|
| **Lead** | Create batches, upload images, run inference, assign tasks, export data, manage model weights, invite annotators |
| **Annotator** | View assigned tasks, edit bounding boxes, submit completed annotations |

---

## 2. Getting Started

### Accessing the Platform

Open your browser and go to:

```
https://h8labeling.com
```

### Logging In

Enter your email and password on the login screen. If you do not have an account, you need an invite link from the lead (see [Section 4.1](#41-accepting-an-invite)).

### Dashboard Overview

**Lead Dashboard** — After logging in as a lead, you will see:
- A list of all batches on the left sidebar
- Batch details panel on the right (images, classes, inference controls, task assignment, export)

**Annotator Dashboard** — After logging in as an annotator, you will see a queue of tasks assigned to you, each representing one image to annotate.

---

## 3. Lead Guide

### 3.1 Creating a Batch

A batch is a collection of images that will be annotated together.

1. Type a name in the **"New batch name"** field at the top left
2. Click the **+** button
3. The new batch appears in the left sidebar with status **pending**

> **Tip:** Use descriptive names like `Drone_Flight_May2026` or `GCS_Test_Batch_01` — the export folder in GCS will use this name.

---

### 3.2 Uploading Images

To upload images from your local computer:

1. Select the batch from the sidebar
2. Scroll to the **Upload Images** section
3. Click **Choose Files** and select one or more images (JPG, PNG, WEBP supported)
4. Images are uploaded immediately and appear in the batch

> **Note:** For large datasets (hundreds or thousands of images), use the GCS method below instead of local upload.

---

### 3.3 Linking a GCS Folder

For large-scale datasets stored in Google Cloud Storage:

1. Select the batch from the sidebar
2. Scroll to the **GCS Image Source** section
3. Enter the folder path (e.g., `test/` or `flights/may2026/`)
   - Do **not** include the bucket name — just the folder path
4. Click **Link & Import**
5. The system scans the GCS bucket and imports all images found in that folder
6. A confirmation message shows how many images were imported

> **Note:** The GCS bucket is pre-configured as `h8-labeling-data2`. Only the folder path needs to be entered.

---

### 3.4 Running Inferences

After images are uploaded, run the YOLOv11 model to auto-generate bounding box predictions.

1. Select the batch
2. Scroll to the **Annotation Mode** section
3. Click **Run Inferences**
4. A modal appears with two options:

#### Option A — CPU Inference (Server)
- Runs on your DigitalOcean server using the CPU
- Good for small batches (up to ~50 images)
- Speed: ~25 seconds per image
- Select existing weights or upload new `.pt` weights
- Click **Run on CPU** — inference starts in the background
- Batch status changes to **processing**, then **done** when complete

#### Option B — Sol GPU Inference (ASU HPC)
- Runs on an NVIDIA A100 GPU on ASU Sol
- Recommended for large batches (100+ images)
- Speed: ~0.5 seconds per image
- Steps:
  1. Select this option to see the generated shell command
  2. Click **Copy** to copy the command
  3. Open ASU Sol Shell Access (see [Section 5](#5-sol-gpu-setup))
  4. Request a GPU node and paste the command as a single line
  5. Predictions are posted back to the app automatically as they complete
  6. Batch status is set to **done** when all images are processed

---

### 3.5 Starting from Scratch

If you do not want to use model predictions and prefer fully manual annotation:

1. Select the batch
2. Click **Start from Scratch**
3. All uploaded images are marked as ready for annotation with empty canvases
4. Assign to annotators as normal (see [Section 3.7](#37-assigning-tasks-to-annotators))

---

### 3.6 Managing Classes

Classes define the labels annotators can apply to bounding boxes. They must be set up before assigning tasks.

#### Adding Classes Manually
1. Type a class name in the **Add class name** field
2. Click **+ Add**
3. Each class is assigned a unique color automatically

#### Uploading a YOLO data.yaml
1. Click **Upload data.yaml**
2. Select your existing YOLO dataset YAML file
3. Classes are extracted and populated automatically

> **Note:** Classes are shared across the entire batch. All annotators in the same batch use the same class list.

---

### 3.7 Assigning Tasks to Annotators

Once inference is complete and classes are set up, distribute images to your team:

1. Scroll to the **Assign Tasks to Annotators** section
2. Check the boxes next to the annotators you want to assign work to
3. Click **Assign to Annotators**
4. Images are divided equally among selected annotators
5. Each annotator receives a personal queue of tasks

> **Note:** The **Assign** button is locked until inference is complete (batch status = **done**). This ensures annotators always receive pre-populated boxes.

---

### 3.8 Exporting Annotations to GCS

When annotation is complete, export the dataset in YOLO OBB format:

1. Select the batch
2. Scroll to the **Export** section
3. Click **Push All to GCS**
4. The system uploads to your GCS bucket in a folder named after the batch

**Export structure in GCS:**
```
<batch-name>/
├── images/
│   ├── image1.jpg
│   ├── image2.jpg
│   └── ...
├── labels/
│   ├── image1.txt
│   ├── image2.txt
│   └── ...
└── data.yaml
```

Each label file is in YOLO OBB format:
```
<class_id> <cx> <cy> <w> <h> <angle>
```
All values are normalized (0–1) relative to image dimensions. Angle is in degrees.

---

### 3.9 Model Management

To upload new model weights (e.g., after retraining):

1. Scroll to the **Annotation Mode** section
2. Click **Run Inferences → Upload new weights**
3. Select your new `.pt` file
4. The server updates the weights and the Celery CPU worker reloads automatically
5. Sol GPU inference also auto-downloads the latest weights at the start of each run — no manual update needed on Sol

---

## 4. Annotator Guide

### 4.1 Accepting an Invite

The lead generates an invite link for each new annotator:

1. The lead goes to the **Invite Annotators** section on their dashboard
2. Clicks **Generate Invite Link** and copies the link
3. Sends the link to the annotator

The annotator:
1. Opens the link in a browser
2. Fills in their name, email, and password
3. Their account is created with the **annotator** role
4. They can now log in at `https://h8labeling.com`

---

### 4.2 Opening a Task

After logging in, annotators see their task queue:

1. Each card shows the image thumbnail, batch name, and status
2. Click **Open** on any pending task
3. The annotation canvas loads with the image and pre-populated bounding boxes

---

### 4.3 Using the Annotation Canvas

The canvas is the core of the annotation workflow. Pre-predicted OBB boxes are shown on the image and can be adjusted.

#### Viewing Boxes
- Each class has a distinct color shown in the legend at the top
- Boxes are drawn as oriented rectangles with a label

#### Selecting a Box
- Click on any box to select it
- Selected boxes show **drag handles** at the corners and edges
- A **rotation handle** appears above the box

#### Moving a Box
- Click and drag the box body to reposition it

#### Resizing a Box
- Drag any of the **corner or edge handles** to resize

#### Rotating a Box
- Drag the **rotation handle** (circle above the box) to change the angle
- This is the most important operation for OBB — align the box with the actual orientation of the part

#### Adding a New Box
- Select a class from the legend
- Click and drag on the canvas to draw a new box

#### Deleting a Box
- Select a box and press the **Delete** key, or click the delete button in the toolbar

#### Zooming and Panning
- Scroll to zoom in/out
- Hold Space and drag to pan around the image

---

### 4.4 Submitting Annotations

When all boxes in the image are correctly placed and oriented:

1. Click **Submit** in the top toolbar
2. The task is marked as **completed**
3. You are returned to your task queue
4. Move to the next pending task

> **Important:** Submit only when you are satisfied with all boxes. Once submitted, the task is locked.

---

## 5. Sol GPU Setup

This section is for the lead only. Sol setup is a one-time process.

### Prerequisites
- ASU NetID with access to Sol HPC
- Access to ASU Open OnDemand portal: `ood04.sol.rc.asu.edu`

### One-Time Setup

1. Open **Sol Shell Access** from the OOD portal
2. Create the working directory:
   ```bash
   mkdir -p /scratch/<netid>/h8-labeling && cd /scratch/<netid>/h8-labeling
   ```
3. Download the inference script:
   ```bash
   wget -O sol_infer.py https://raw.githubusercontent.com/vasukhanna6292/h8-labeling/main/scripts/sol_infer.py
   ```
4. Install dependencies (one-time, takes ~2 minutes):
   ```bash
   pip install --user ultralytics google-cloud-storage requests pillow
   ```
5. Upload via **OOD Files → Scratch Directory → h8-labeling/**:
   - `best.pt` — your YOLO model weights
   - `gcs-key.json` — GCS service account key

### Running Inference

Each time you want to run Sol inference:

1. Request a GPU node:
   ```bash
   srun --partition=htc --gres=gpu:a100:1 --time=02:00:00 --pty bash
   ```
2. Wait for the prompt to change to `[<netid>@sg0...]`
3. Copy the command from the **Sol GPU Job** modal in the app (it auto-fills your batch ID and token)
4. Paste and run as a single line in the GPU shell
5. The script will:
   - Auto-download the latest model weights from the server
   - Download each image (from GCS or via API for local images)
   - Run inference on the A100 GPU
   - Post predictions back to the app automatically
   - Set batch status to done when complete

### Updating Model Weights on Sol

No action needed. Every Sol run automatically downloads the latest weights uploaded via the Model Management UI.

---

## 6. FAQ & Troubleshooting

**Q: The batch is stuck at "processing" status.**  
A: This can happen if the server was restarted mid-inference. Run this SQL on the server to reset it:
```sql
UPDATE batches SET status='pending' WHERE status='processing';
```
Then re-run inference.

---

**Q: GCS Link & Import shows "0 images imported" even though images exist.**  
A: Check that you entered only the folder path (e.g., `test/`) without the bucket name. The bucket `h8-labeling-data2` is pre-configured.

---

**Q: The annotation canvas shows "Loading image..."**  
A: This is usually a temporary network issue. Refresh the page and reopen the task.

---

**Q: Sol inference completed but predictions don't appear in the app.**  
A: Check that the `--api-url` in the Sol command is `http://165.22.151.113/api` (not `:8000`). Use the Copy button in the Sol GPU Job modal to get the correct command.

---

**Q: I uploaded new weights but Sol is still using the old model.**  
A: The Sol script auto-downloads weights at the start of each run. Simply re-run inference and it will pick up the new weights automatically.

---

**Q: The Copy button doesn't work.**  
A: Make sure you are accessing the tool via `https://h8labeling.com`. The copy function requires a secure (HTTPS) connection.

---

**Q: How do I add a new annotator?**  
A: Go to the **Invite Annotators** section on the Lead Dashboard, generate a new invite link, and send it to the annotator. Each link can only be used once.

---

**Q: Can the same GCS images be used in multiple batches?**  
A: Yes. The same GCS folder can be linked to different batches without conflict.

---

*For technical issues, contact the platform administrator at vasukhanna6292@gmail.com*
