# H8 Labeling — AI-Assisted OBB Annotation Platform

A collaborative oriented bounding box (OBB) annotation platform built for part-based explainable AI (XAI) image labeling. The platform uses a trained YOLOv11 model to automatically pre-populate bounding boxes on images, allowing human annotators to focus only on inspection and correction — reducing annotation time by ~80%.

**Live:** http://h8labeling.duckdns.org

---

## What This Does

Instead of drawing every bounding box from scratch:

1. Lead uploads a batch of images
2. YOLOv11 model automatically runs inference and pre-populates all bounding boxes
3. Tasks are distributed equally among 10 annotators
4. Annotators inspect, rotate, resize, or delete boxes using an interactive canvas
5. Lead exports the final labeled dataset in YOLO OBB format for model retraining

---

## Features

| Feature | Description |
|---------|-------------|
| JWT Auth | Secure login with two roles: Lead and Annotator |
| Invite System | Lead generates invite links for team members |
| AI Inference | YOLOv11 auto-populates bounding boxes on upload |
| OBB Canvas | Drag, rotate, resize oriented bounding boxes in browser |
| Task Queue | Round-robin distribution of images across annotators |
| Progress Tracking | Real-time view of completed/pending tasks per annotator |
| YOLO Export | One-click export in YOLO OBB format (images/labels/data.yaml) |
| Model Upload | Lead can hot-swap the inference model without restarting |
| Cloud Watcher | Auto-detects new images from S3/GCP cloud storage |

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
| Server | Oracle Cloud Ubuntu 22.04 |

---

## Project Structure

```
annotation-agent/
├── backend/
│   ├── app/
│   │   ├── core/          # Auth, dependencies, email
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
├── docker-compose.yml
├── nginx.conf
├── .env.example
└── README.md
```

---

## Quick Start (Local Development)

### Prerequisites
- Docker Desktop installed
- Your trained YOLOv11 model file (`best.pt`)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/h8-labeling.git
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

## Deployment (Oracle Cloud)

This app is deployed on Oracle Cloud Free Tier — completely free forever.

### Infrastructure

| Resource | Spec | Cost |
|----------|------|------|
| VM | Oracle Cloud Ubuntu 22.04 | $0 |
| Database | PostgreSQL on block storage | $0 |
| Domain | DuckDNS subdomain | $0 |
| **Total** | | **$0/month** |

### Deploy to a fresh Ubuntu server

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo apt install -y docker-compose-plugin

# 2. Clone the project
git clone https://github.com/YOUR_USERNAME/h8-labeling.git
cd h8-labeling

# 3. Configure .env for production
cp .env.example .env
# Edit .env with your server IP and secrets

# 4. Add model weights
# Upload best.pt to backend/weights/best.pt

# 5. Start
sudo docker compose up -d --build

# 6. Run migrations
sudo docker compose exec backend alembic upgrade head

# 7. Open firewall ports
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login, returns JWT token |
| POST | `/invites/` | Generate invite link (lead only) |
| POST | `/invites/{token}/register` | Register via invite link |

### Batches (Lead only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/batches/` | Create new batch |
| GET | `/batches/` | List all batches |
| POST | `/batches/{id}/trigger-inference` | Run YOLOv11 on batch |
| POST | `/batches/{id}/assign` | Distribute tasks to annotators |
| GET | `/batches/{id}/progress` | Get annotation progress |
| GET | `/batches/{id}/export` | Download YOLO OBB zip |

### Tasks (Annotators)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tasks/my-queue` | Get assigned tasks |
| GET | `/tasks/{id}/predictions` | Get AI predictions for image |
| PATCH | `/tasks/{id}` | Save annotations + mark complete |

### Images

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/images/batches/{id}/upload` | Upload images to batch |
| GET | `/images/{id}/file` | Serve raw image file |

Full interactive API docs available at `/docs` when running.

---

## Data Models

```
User (id, name, email, hashed_password, role)
  └── Task (id, image_id, user_id, status, annotations_json)
        └── Image (id, batch_id, file_path, status)
              ├── Prediction (id, image_id, class_name, cx, cy, w, h, angle, confidence)
              └── Batch (id, name, status, created_at)
```

---

## Roles

| Role | Permissions |
|------|------------|
| **Lead** | Upload images, trigger inference, assign tasks, export, manage users, upload models |
| **Annotator** | View assigned tasks, edit bounding boxes, mark complete |

---

## Annotation Canvas Controls

| Action | How |
|--------|-----|
| Select box | Click on it |
| Move box | Drag center |
| Rotate box | Drag rotation handle |
| Resize box | Drag corner handles |
| Draw new box | Click "Draw" mode, drag on canvas |
| Delete box | Select + press Delete key |
| Next image | Arrow key → or Next button |
| Previous image | Arrow key ← or Prev button |
| Skip image | Click Skip |

---

## Export Format

Exports a ZIP file containing:

```
export/
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
| `APP_URL` | Frontend URL (for CORS) | Yes |
| `VITE_API_URL` | Backend API URL (for frontend) | Yes |
| `WATCHER_ENABLED` | Enable cloud storage watcher | No |
| `AWS_ACCESS_KEY_ID` | AWS S3 credentials | No |
| `AWS_SECRET_ACCESS_KEY` | AWS S3 credentials | No |
| `AWS_BUCKET_NAME` | S3 bucket name | No |
| `SMTP_HOST` | Email server for notifications | No |

---

## Built With

- [FastAPI](https://fastapi.tiangolo.com/)
- [Ultralytics YOLOv11](https://docs.ultralytics.com/)
- [React](https://react.dev/)
- [Konva.js](https://konvajs.org/)
- [PostgreSQL](https://www.postgresql.org/)
- [Celery](https://docs.celeryq.dev/)
- [Docker](https://www.docker.com/)

---

## License

This project was built for research purposes at Arizona State University.
