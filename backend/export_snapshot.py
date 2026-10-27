"""Run once locally: python export_snapshot.py  -> writes backend/data/*.csv.gz (commit them)."""
from app.data import fetch_live, write_snapshot
A, F, rep = fetch_live()
write_snapshot(A, F, rep)
print("actuals", len(A), "forecasts", len(F), rep)
