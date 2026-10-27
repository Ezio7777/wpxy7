"""Data access: fetch BMRS FUELHH (WIND) + WINDFOR, clean, cache."""
import json, os, pickle
from datetime import datetime, timedelta, timezone
import httpx, pandas as pd

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
CACHE = os.getenv("CACHE_FILE", "/tmp/wind_cache.pkl")
START = datetime(2026, 1, 1, tzinfo=timezone.utc)
END = datetime(2026, 2, 1, tzinfo=timezone.utc)
FMT = "%Y-%m-%dT%H:%MZ"

def _get(path, params):
    r = httpx.get(f"{BASE}/{path}", params={**params, "format": "json"}, timeout=90)
    r.raise_for_status()
    body = r.json()
    return body if isinstance(body, list) else body.get("data", [])

def _chunks(a, b, days):
    while a < b:
        yield a, min(a + timedelta(days=days), b)
        a += timedelta(days=days)

def _clean(df, keys, cols):
    rep = {"raw_rows": len(df)}
    df = df[cols].copy()
    for c in ("startTime", "publishTime"):
        if c in df: df[c] = pd.to_datetime(df[c], utc=True, errors="coerce")
    df["generation"] = pd.to_numeric(df["generation"], errors="coerce")
    n = len(df); df = df.dropna(); rep["null_or_malformed_dropped"] = n - len(df)
    df = df[df.generation >= 0]
    n = len(df); df = df.drop_duplicates(keys, keep="last"); rep["duplicates_dropped"] = n - len(df)
    rep["clean_rows"] = len(df)
    return df.reset_index(drop=True), rep

def fetch_live():
    if os.path.exists(CACHE):
        return pickle.load(open(CACHE, "rb"))
    act = []
    for a, b in _chunks(START, END, 7):
        act += _get("FUELHH/stream", {"settlementDateFrom": a.strftime("%Y-%m-%d"),
                    "settlementDateTo": (b - timedelta(days=1)).strftime("%Y-%m-%d"), "fuelType": "WIND"})
    act = [r for r in act if r.get("fuelType") == "WIND"]
    fc = []
    # decisions for 1 Jan are made on 31 Dec, so publishes start there
    for a, b in _chunks(START - timedelta(days=1), END, 3):
        fc += _get("WINDFOR/stream", {"publishDateTimeFrom": a.strftime(FMT), "publishDateTimeTo": b.strftime(FMT)})
    A, ra = _clean(pd.DataFrame(act), ["startTime"], ["startTime", "generation"])
    F, rf = _clean(pd.DataFrame(fc), ["startTime", "publishTime"], ["startTime", "publishTime", "generation"])
    A = A[(A.startTime >= START) & (A.startTime < END)]
    F = F[(F.startTime >= START) & (F.startTime < END)]
    out = (A, F, {"actuals": ra, "forecasts": rf})
    pickle.dump(out, open(CACHE, "wb"))
    return out

SNAP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

def write_snapshot(A, F, rep):
    os.makedirs(SNAP, exist_ok=True)
    A.to_csv(os.path.join(SNAP, "actuals.csv.gz"), index=False)
    F.to_csv(os.path.join(SNAP, "forecasts.csv.gz"), index=False)
    json.dump(rep, open(os.path.join(SNAP, "report.json"), "w"))

def _snapshot():
    a = os.path.join(SNAP, "actuals.csv.gz")
    if not os.path.exists(a): return None
    A = pd.read_csv(a); F = pd.read_csv(os.path.join(SNAP, "forecasts.csv.gz"))
    for df, cols in ((A, ["startTime"]), (F, ["startTime", "publishTime"])):
        for c in cols: df[c] = pd.to_datetime(df[c], utc=True)
    return A, F, json.load(open(os.path.join(SNAP, "report.json")))

def load():
    """Committed snapshot first (serverless / no network), else live fetch with local cache."""
    return _snapshot() or fetch_live()
