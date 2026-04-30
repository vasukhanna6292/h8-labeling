# H8 Labeling — AI-Assisted OBB Annotation Platform

A collaborative oriented bounding box (OBB) annotation platform built for part-based explainable AI (XAI) image labeling. The platform uses a trained YOLOv11 model to automatically pre-populate bounding boxes on images, allowing human annotators to focus only on inspection and correction — reducing annotation time by ~80%.

**Live:** https://h8labeling.com

---

## What This Does

Instead of drawing every bounding box from scratch:

1. Lead uploads a batch of images (locally or from Google Cloud Storage)
2. YOLOv11 model automatically runs inference — on CPU or ASU Sol A100 GPU
3. Tasks are distributed equally among annotators
4. Annotators inspect, rotate, resize, or delete boxes using an interactive canvas
5. Lead exports the final labeled dataset in YOLO OBB format directly to GCS for model retraining

---

## Features

| Feature | Description |
|---------|-------------|
| JWT Auth | Secure login with two roles: Lead and Annotator |
| Invite System | Lead generates single-use invite links for team members |
| AI Inference (CPU) | YOLOv11 runs on server CPU via Celery worker |
| AI Inference (Sol GPU) | YOLOv11 runs on ASU Sol A100 GPU via external script |
| Start from Scratch | Skip inference and annotate images manually from blank canvas |
| GCS Integration | Link a GCS folder to import images directly from Google Cloud Storage |
| OBB Canvas | Drag, rotate, resize oriented bounding boxes in browser (Konva.js) |
| Task Queue | Round-robin distribution of images across annotators |
| Progress Tracking | Real-time view of completed/pending tasks per annotator |
| GCS Export | One-click export to GCS in YOLO OBB format (images/labels/data.yaml) |
| Model Upload | Lead can hot-swap the inference model without restarting |
| Auto Weight Sync | Sol script auto-downloads latest weights from server before each run |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI (Python 3.12) |
| Database | PostgreSQL 15 |
| Task Queue | Celery 5 + Redis 7 |
| AI Inference | YOLOv11 via Ultralytics |
| Frontend | React 18 + Konva.js |
| Styling | Tailwind CSS |
| Reverse Proxy | Nginx |
| Deployment | Docker Compose |
| Server | DigitalOcean Ubuntu 24.04 (s-2vcpu-4gb, ~$24/month) |
| Image Storage | Google Cloud Storage (h8-labeling-data2) |
| GPU Inference | ASU Sol HPC — NVIDIA A100 |
| SSL | Let's Encrypt (auto-renewing) |

---

## Project Structure

```
annotation-agent/
├── backend/
│   ├── app/
│   │   ├── core/          # Auth, dependencies, GCS client
│   │   ├── models/        # SQLAlchemy DB models
│   │   ├── routers/       # API endpoints
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── worker/        # Celery tasks + inference
│   │   ├── main.py        # FastAPI app entry point
│   │   ├── config.py      # Settings from .env
│   │   └── database.py    # DB session
│   ├── alembic/           # Database migrations
│   ├── weights/           # YOLOv11 model (best.pt) — not committed
│   ├── uploads/           # Uploaded images — not committed
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── LeadDashboard.jsx
│   │   │   ├── AnnotatorQueue.jsx
│   │   │   ├── AnnotationCanvas.jsx
│   │   │   └── RegisterWithInvite.jsx
│   │   ├── api/client.js
│   │   ├── context/AuthContext.jsx
│   │   └── App.jsx
│   ├── Dockerfile
│   └── package.json
├── scripts/
│   └── sol_infer.py       # ASU Sol GPU inference script
├── docker-compose.yml
├── nginx.conf
├── .env.example
├── DOCUMENTATION.md       # Full user documentation
└── README.md
```

---

## Quick Start (Local Development)

### Prerequisites
- Docker Desktop installed
- Your trained YOLOv11 model file (`best.pt`)

### 1. Clone the repo

```bash
git clone https://github.com/vasukhanna6292/h8-labeling.git
cd h8-labeling
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:

```env
DATABASE_URL=postgresql://admin:admin123@postgres:5432/annotation_db
SECRET_KEY=your-long-random-secret-key-here
REDIS_URL=redis://redis:6379/0
MODEL_PATH=/app/weights/best.pt
POSTGRES_USER=admin
POSTGRES_PASSWORD=admin123
POSTGRES_DB=annotation_db
APP_URL=http://localhost:3000
VITE_API_URL=http://localhost:8000

# Google Cloud Storage (optional for local dev)
GCS_BUCKET_NAME=your-gcs-bucket
GCS_KEY_PATH=/run/secrets/gcs-key.json
```

Generate a secret key:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Add your model weights

```bash
cp /path/to/your/best.pt backend/weights/best.pt
```

### 4. Start all services

```bash
docker compose up --build
```

### 5. Run database migrations

```bash
docker compose exec backend alembic upgrade head
```

### 6. Create the first lead user

```bash
docker compose exec backend python3 -c "
from app.database import SessionLocal
from app.models.user import User, UserRole
from app.core.auth import hash_password
db = SessionLocal()
lead = User(name='Your Name', email='you@example.com', hashed_password=hash_password('yourpassword'), role=UserRole.lead)
db.add(lead)
db.commit()
print('Lead created')
"
```

### 7. Open the app

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| API Docs | http://localhost:8000/docs |

---

## Deployment (DigitalOcean)

This app is deployed on a DigitalOcean droplet with HTTPS via Let's Encrypt.

### Infrastructure

| Resource | Spec | Cost |
|----------|------|------|
| VM | DigitalOcean s-2vcpu-4gb Ubuntu 24.04 | ~$24/month |
| Image Storage | Google Cloud Storage | ~$8-15/month |
| Domain | h8labeling.com (Namecheap) | ~$1/month |
| SSL | Let's Encrypt | Free |
| GPU Inference | ASU Sol HPC | Free (university) |
| **Total** | | **~$35-40/month** |

### Deploy to a fresh Ubuntu server

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo apt install -y docker-compose-plugin

# 2. Clone the project
git clone https://github.com/vasukhanna6292/h8-labeling.git
cd h8-labeling

# 3. Configure .env for production
cp .env.example .env
# Edit .env with your domain and secrets

# 4. Add model weights
# Upload best.pt to backend/weights/best.pt

# 5. Add GCS key
mkdir -p secrets
# Upload your GCS service account JSON to secrets/gcs-key.json

# 6. Start all services
docker compose up -d --build

# 7. Run migrations
docker compose exec backend alembic upgrade head

# 8. Set up HTTPS (after pointing DNS to your server IP)
apt-get install -y certbot python3-certbot-nginx
docker compose stop nginx
certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com
# Update nginx.conf with SSL config, then:
docker compose up -d nginx
```

---

## Sol GPU Inference (ASU HPC)

For large batches (100k+ images), inference runs on ASU Sol A100 GPUs.

### One-Time Setup on Sol

```bash
# 1. Create working directory
mkdir -p /scratch/<netid>/h8-labeling && cd /scratch/<netid>/h8-labeling

# 2. Download inference script
wget -O sol_infer.py https://raw.githubusercontent.com/vasukhanna6292/h8-labeling/main/scripts/sol_infer.py

# 3. Install dependencies
pip install --user ultralytics google-cloud-storage requests pillow

# 4. Upload via OOD Files browser:
#    - best.pt (model weights — auto-synced from server on each run)
#    - gcs-key.json (GCS service account key)
```

### Running Inference

```bash
# 1. Request GPU node
srun --partition=htc --gres=gpu:a100:1 --time=02:00:00 --pty bash

# 2. Run inference (copy command from the Sol GPU Job modal in the app)
python3 /scratch/<netid>/h8-labeling/sol_infer.py \
  --batch-id <id> \
  --api-url https://h8labeling.com/api \
  --api-token <your-jwt-token> \
  --model-path /scratch/<netid>/h8-labeling/best.pt \
  --gcs-bucket h8-labeling-data2 \
  --gcs-key /scratch/<netid>/h8-labeling/gcs-key.json
```

The script automatically downloads the latest model weights from the server before each run. Predictions are posted back to the app in real time.

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login, returns JWT token |
| POST | `/invites/` | Generate invite link (lead only) |
| POST | `/invites/{token}/register` | Register via invite link |

### Batches

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/batches/` | Create new batch |
| GET | `/batches/` | List all batches |
| POST | `/batches/{id}/trigger-inference` | Run CPU inference via Celery |
| POST | `/batches/{id}/start-scratch` | Mark all images ready without inference |
| POST | `/batches/{id}/assign` | Distribute tasks to annotators |
| GET | `/batches/{id}/progress` | Get annotation progress |
| POST | `/batches/{id}/export-gcs` | Export dataset to GCS in YOLO OBB format |
| POST | `/batches/{id}/link-gcs` | Import images from a GCS folder |
| POST | `/batches/{id}/finalize-sol` | Called by Sol script to mark batch done |

### Images

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/images/batches/{id}/upload` | Upload images to batch |
| GET | `/images/batches/{id}` | List images in batch |
| GET | `/images/{id}/file` | Serve image file (proxies GCS through backend) |
| POST | `/images/{id}/predictions` | Receive predictions from Sol script |
| DELETE | `/images/{id}` | Delete image and its predictions |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tasks/my-queue` | Get assigned tasks |
| GET | `/tasks/{id}/predictions` | Get AI predictions for image |
| PATCH | `/tasks/{id}` | Save annotations + mark complete |

### Models

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/models/current` | Get current model metadata |
| POST | `/models/upload` | Upload new .pt weights file |
| GET | `/models/download` | Download current weights (used by Sol script) |

Full interactive API docs available at `https://h8labeling.com/docs`.

---

## Data Models

```
User (id, name, email, hashed_password, role)
  └── Task (id, image_id, user_id, status, annotations_json)

Batch (id, name, status, classes, created_at)
  └── Image (id, batch_id, file_path, storage_url, status)
        └── Prediction (id, image_id, class_name, cx, cy, w, h, angle, confidence)
```

---

## Export Format

Exports directly to Google Cloud Storage under a folder named after the batch:

```
<batch-name>/
├── images/
│   ├── image1.jpg
│   └── image2.jpg
├── labels/
│   ├── image1.txt      # YOLO OBB format
│   └── image2.txt
└── data.yaml           # Class names + dataset config
```

YOLO OBB label format per line:
```
class_id cx cy w h angle
```
All values normalized (0–1). Angle in degrees.

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SECRET_KEY` | JWT signing key (32+ chars) | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `MODEL_PATH` | Path to YOLOv11 weights inside container | Yes |
| `POSTGRES_USER` | PostgreSQL username | Yes |
| `POSTGRES_PASSWORD` | PostgreSQL password | Yes |
| `POSTGRES_DB` | PostgreSQL database name | Yes |
| `APP_URL` | Frontend URL | Yes |
| `VITE_API_URL` | Backend API URL (baked into frontend at build time) | Yes |
| `GCS_BUCKET_NAME` | Google Cloud Storage bucket name | For GCS features |
| `GCS_KEY_PATH` | Path to GCS service account JSON key | For GCS features |
| `WATCHER_ENABLED` | Enable cloud storage watcher | No |
| `AWS_ACCESS_KEY_ID` | AWS S3 credentials (watcher only) | No |
| `AWS_SECRET_ACCESS_KEY` | AWS S3 credentials (watcher only) | No |
| `AWS_BUCKET_NAME` | S3 bucket name (watcher only) | No |

---

## Annotation Canvas Controls

| Action | How |
|--------|-----|
| Select box | Click on it |
| Move box | Drag center |
| Rotate box | Drag rotation handle |
| Resize box | Drag corner handles |
| Draw new box | Click class in legend, drag on canvas |
| Delete box | Select + press Delete key |
| Zoom | Scroll wheel |
| Pan | Hold Space + drag |

---

## Roles

| Role | Permissions |
|------|------------|
| **Lead** | Create batches, upload images, link GCS, run inference, assign tasks, export, manage model weights, invite annotators |
| **Annotator** | View assigned tasks, edit bounding boxes, mark complete |

---

## Built With

- [FastAPI](https://fastapi.tiangolo.com/)
- [Ultralytics YOLOv11](https://docs.ultralytics.com/)
- [React](https://react.dev/)
- [Konva.js](https://konvajs.org/)
- [PostgreSQL](https://www.postgresql.org/)
- [Celery](https://docs.celeryq.dev/)
- [Google Cloud Storage](https://cloud.google.com/storage)
- [Docker](https://www.docker.com/)

---

## License

This project was built for research purposes at Arizona State University.
