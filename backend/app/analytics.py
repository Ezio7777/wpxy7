"""Pure analytics: forecast selection, metrics, uncertainty buffer."""
import numpy as np, pandas as pd

CUTOFF_HOUR_UTC = 9   # decision at 09:00 on D-1 (Jan: UK local time == UTC)
MODES = {"conservative": 0.90, "balanced": 0.75, "aggressive": 0.50}

def latest_before(A, F, cutoff_hour=CUTOFF_HOUR_UTC):
    """For each delivery interval: latest forecast with publishTime <= (D-1 at cutoff_hour)."""
    a = A.rename(columns={"generation": "actual"}).copy()
    a["cutoff"] = a.startTime.dt.normalize() - pd.Timedelta(days=1) + pd.Timedelta(hours=cutoff_hour)
    f = F.rename(columns={"generation": "forecast"}).sort_values("publishTime")
    m = pd.merge_asof(a.sort_values("cutoff"), f, left_on="cutoff", right_on="publishTime",
                      by="startTime", direction="backward")
    m["error"] = m.forecast - m.actual          # + = over-forecast
    m["abs_error"] = m.error.abs()
    m["lead_h"] = (m.startTime - m.publishTime).dt.total_seconds() / 3600
    return m.sort_values("startTime").reset_index(drop=True)

def metrics(m):
    d = m.dropna(subset=["forecast"])
    if d.empty: return {}
    denom = (d.actual.abs() + d.forecast.abs()).replace(0, np.nan)
    return {"n": int(len(d)), "mae": d.abs_error.mean(), "rmse": float(np.sqrt((d.error ** 2).mean())),
            "smape": float((2 * d.abs_error / denom).mean() * 100), "bias": d.error.mean(),
            "avg_actual": d.actual.mean(), "avg_forecast": d.forecast.mean(),
            "freshness_h": d.lead_h.mean()}

def buffers(m):
    d = m.dropna(subset=["forecast"])
    short = (d.forecast - d.actual).clip(lower=0)   # forecast wind that did not show up
    return {k: float(short.quantile(q)) for k, q in MODES.items()}

def band(m):
    d = m.dropna(subset=["forecast"]); r = d.actual - d.forecast
    return float(r.quantile(0.10)), float(r.quantile(0.90))

def breakdowns(m):
    d = m.dropna(subset=["forecast"]).copy()
    d["date"] = d.startTime.dt.strftime("%Y-%m-%d"); d["slot"] = d.startTime.dt.hour * 2 + d.startTime.dt.minute // 30
    g = lambda k: [{"key": key, **{c: float(v) for c, v in x.items()}} for key, x in
                   d.groupby(k).agg(mae=("abs_error", "mean"), bias=("error", "mean"),
                                    rmse=("error", lambda s: float(np.sqrt((s ** 2).mean())))).iterrows()]
    cnt, edges = np.histogram(d.abs_error, bins=10)
    hist = [{"range": f"{edges[i]:.0f}-{edges[i+1]:.0f}", "count": int(cnt[i])} for i in range(10)]
    return {"daily": g("date"), "by_slot": g("slot"), "hist": hist}

def insight(mt, buf, miss):
    side = "over-forecast" if mt["bias"] > 0 else "under-forecast"
    return (f"Using the forecast published before each 09:00 day-ahead cutoff, wind was off by "
            f"{mt['mae']:.0f} MW on average (RMSE {mt['rmse']:.0f} MW) and tended to {side} by {abs(mt['bias']):.0f} MW. "
            f"In 1 in 10 half-hours wind fell short of forecast by more than {buf['conservative']:.0f} MW; "
            f"{miss} intervals had no usable forecast.")
