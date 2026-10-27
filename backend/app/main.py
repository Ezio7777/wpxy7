import io, os
from functools import lru_cache
import numpy as np, pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from . import analytics as an
from .data import load

app = FastAPI(title="Wind Forecast Pilot")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
                   allow_methods=["GET", "HEAD"], allow_headers=["*"])

@lru_cache(maxsize=1)
def state():
    A, F, rep = load()
    return A, F, rep, an.latest_before(A, F)

def clean(o):
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list): return [clean(v) for v in o]
    if isinstance(o, (float, np.floating)): return None if np.isnan(o) else round(float(o), 2)
    return o

def check(month):
    if month != "2026-01": raise HTTPException(400, "Only month=2026-01 is supported")

@app.api_route("/health", methods=["GET", "HEAD"])
def health(): return {"status": "ok"}

@app.get("/api/metadata")
def metadata():
    A, F, rep, m = state()
    return {"month": "2026-01", "cutoff": "09:00 on D-1 (UTC = UK time in January)", "cleaning": rep,
            "forecast_rows": len(F), "actual_rows": len(A),
            "datasets": ["FUELHH (fuelType=WIND)", "WINDFOR"]}

@app.get("/api/dashboard")
def dashboard(month: str = "2026-01"):
    check(month); A, F, rep, m = state()
    mt, buf, (lo, hi) = an.metrics(m), an.buffers(m), an.band(m)
    miss = int(m.forecast.isna().sum())
    return clean({"metrics": mt, "buffers": buf, "band": {"p10": lo, "p90": hi}, "missing_intervals": miss,
                  "cleaning": rep, "insight": an.insight(mt, buf, miss),
                  "latest_actual": m.dropna(subset=["actual"]).iloc[-1][["startTime", "actual"]].astype(str).to_dict()})

@app.get("/api/intervals")
def intervals(month: str = "2026-01"):
    check(month); _, _, _, m = state(); lo, hi = an.band(m)
    d = m.assign(low=(m.forecast + lo).clip(lower=0), high=m.forecast + hi)
    d["t"] = d.startTime.dt.strftime("%Y-%m-%dT%H:%MZ"); d["published"] = d.publishTime.dt.strftime("%Y-%m-%dT%H:%MZ")
    return clean(d[["t", "actual", "forecast", "error", "low", "high", "published", "lead_h"]]
                 .astype(object).where(d[["t", "actual", "forecast", "error", "low", "high", "published", "lead_h"]].notna(), None).to_dict("records"))

@app.get("/api/analysis/errors")
def errors(month: str = "2026-01"):
    check(month); return clean(an.breakdowns(state()[3]))

@app.get("/api/forecast/latest")
def forecast_latest(start: str = Query(..., description="delivery interval start, ISO UTC"),
                    cutoff: str = Query(..., description="decision cutoff, ISO UTC")):
    A, F, _, _ = state()
    try: s, c = pd.Timestamp(start, tz="UTC") if pd.Timestamp(start).tzinfo is None else pd.Timestamp(start).tz_convert("UTC"), \
                pd.Timestamp(cutoff, tz="UTC") if pd.Timestamp(cutoff).tzinfo is None else pd.Timestamp(cutoff).tz_convert("UTC")
    except Exception: raise HTTPException(400, "Invalid timestamp")
    f = F[F.startTime == s].sort_values("publishTime")
    if f.empty: raise HTTPException(404, "No forecasts for that interval")
    elig = f[f.publishTime <= c]
    act = A[A.startTime == s].generation
    rows = [{"published": r.publishTime.strftime("%Y-%m-%dT%H:%MZ"), "forecast": r.generation,
             "available": bool(r.publishTime <= c), "is_latest": bool(len(elig) and r.publishTime == elig.publishTime.max())}
            for r in f.itertuples()]
    return clean({"start": start, "cutoff": cutoff, "actual": float(act.iloc[0]) if len(act) else None,
                  "latest": next((r for r in rows if r["is_latest"]), None), "history": rows})

@app.get("/api/export/csv")
def export_csv(month: str = "2026-01"):
    check(month); _, _, _, m = state()
    buf = io.StringIO(); m.to_csv(buf, index=False); buf.seek(0)
    return StreamingResponse(buf, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=wind_2026-01.csv"})

if os.path.isdir("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="ui")
