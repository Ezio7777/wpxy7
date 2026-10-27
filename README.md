# Wind Forecast Pilot (Elexon BMRS, Jan 2026)
Decision support for UK day-ahead buyers: latest wind forecast at decision time, forecast accuracy, and an uncertainty-based buffer **proxy**.

## Structure
- `backend/app/data.py` – fetch FUELHH (WIND) + WINDFOR, clean (nulls, duplicates, UTC), cache
- `backend/app/analytics.py` – latest-forecast selection, metrics, buffers (pure functions)
- `backend/app/main.py` – FastAPI endpoints; serves built UI in production
- `frontend/` – React + TS + Vite + Recharts
- `Dockerfile`, `docker-compose.yml`, `heroku.yml`

## Latest-forecast rule
For delivery interval `startTime`, cutoff = 09:00 UTC on the previous day (assumed gate; UTC = UK time in January). Pick the forecast with max `publishTime <= cutoff`.

## Run
Docker: `docker compose up --build` → http://localhost:8000 (first request downloads Elexon data, ~1 min, cached in /tmp).
Local: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`; `cd frontend && npm i && npm run dev`.

## Env
`CORS_ORIGINS` (comma list), `CACHE_FILE`, `PORT`, `VITE_API_URL` (only if UI is hosted separately).

## Deploy (Vercel, one project – no separate backend)
1. `cd backend && python export_snapshot.py` (once; writes `backend/data/*.csv.gz` – commit them. The app then needs no live Elexon calls).
2. Push to GitHub, import the repo in Vercel (framework "Other"). `vercel.json` builds the React app and serves FastAPI from `api/index.py` on the same domain, so no CORS or API URL setup.
3. Deployment link: **TODO**.

Alternative: Heroku single container (`heroku stack:set container && git push heroku main`).

## API
`/health`, `/api/metadata`, `/api/dashboard`, `/api/intervals`, `/api/analysis/errors`, `/api/forecast/latest?start=&cutoff=`, `/api/export/csv`.

## Limitations
Single month; in-sample buffer; national level only; no demand/price/weather; the 09:00 cutoff is an assumption; the BMRS stream parameters should be verified against live data.

## AI use
Built with assistance from Claude (Anthropic).
