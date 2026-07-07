# SkinAI

SkinAI is the public portfolio snapshot of Luvel, an AI-assisted skin care and lifestyle tracking app.

The project combines a React Native / Expo mobile app with a FastAPI backend. It records skin condition, diet, cosmetics, medications, sleep, stress, and environment data, then analyzes patterns that may affect skin changes.

## Highlights

- Skin log workflow with photo quality checks and analysis-ready gating
- Diet, cosmetic, medication, behavior, period, and environment records
- AI-assisted report context building and actionable recommendations
- Cosmetic routine clash detection, including ingredient conflicts and missing sunscreen signals
- Food image recognition and cosmetic ingredient OCR with quota and cost tracking
- Public-data ingestion tools for food, cosmetics, and medication master data
- Release readiness checks for backend configuration and mobile app metadata

## Tech Stack

- Mobile: React Native, Expo
- Backend: FastAPI, SQLAlchemy, Alembic
- Database: MySQL, MongoDB
- AI/ML: OpenAI Vision, MedGemma-oriented async analysis pipeline, image quality checks with Pillow/OpenCV/MediaPipe
- Testing: Pytest, Expo release config validation

## Public Repository Scope

This repository is curated for portfolio review. It intentionally excludes production secrets, private environment files, local model binaries, real user data, and operational-only artifacts.

Included code focuses on app architecture, backend domain logic, AI integration patterns, data pipelines, and tests.

## Local Setup

### Backend

```bash
cd apps/backend
python -m venv venv311
venv311\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn main:app --reload
```

### Mobile

```bash
cd apps/mobile
npm install
npm start
```

### Tests

```bash
cd apps/backend
pytest
```

```bash
cd apps/mobile
npm run release:check
```
