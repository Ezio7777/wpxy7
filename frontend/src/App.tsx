import { useEffect, useState } from "react";
import { ResponsiveContainer, ComposedChart, AreaChart, Area, Line, XAxis, YAxis, Tooltip, Legend, BarChart, Bar, CartesianGrid, ReferenceLine } from "recharts";
const API = import.meta.env.VITE_API_URL || "";
const get = (p: string) => fetch(API + p).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
function useApi(p: string) {
  const [d, setD] = useState<any>(null); const [e, setE] = useState("");
  useEffect(() => { setD(null); get(p).then(setD).catch(x => setE(x.message)); }, [p]); return { d, e };
}
const TT: any = { contentStyle: { background: "#111a2b", border: "1px solid rgba(255,255,255,.15)", borderRadius: 10 },
  labelStyle: { color: "#9fb0cc" }, itemStyle: { color: "#e6edf7" }, cursor: { fill: "rgba(255,255,255,.06)", stroke: "rgba(255,255,255,.25)" },
  isAnimationActive: false, offset: 24, wrapperStyle: { pointerEvents: "none", zIndex: 20 },
  formatter: (v: any) => Array.isArray(v) ? `${fmt(v[0])} – ${fmt(v[1])}` : fmt(v) };
const AX: any = { tick: { fill: "#8b9ab3", fontSize: 12 }, stroke: "rgba(255,255,255,.2)" };
const Svg = ({ children }: any) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
const Cal = <Svg><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>;
const Clk = <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
const Dl = <Svg><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></Svg>;
const Field = ({ label, icon, children }: any) => <label className="field"><span>{label}</span><div className="fw">{children}<i>{icon}</i></div></label>;
const pop = (e: any) => { try { e.currentTarget.showPicker(); } catch {} };
const Load = ({ e }: { e: string }) => e ? <div className="card">Could not load data ({e}). The backend may still be fetching Elexon data — retry in a minute.</div> : <div className="sk" />;

function fmt(v: number) { return v == null ? "–" : Math.round(v).toLocaleString(); }

const Kpi = ({ l, v, u }: any) => <div className="card kpi"><span>{l}</span><b>{fmt(v)}{u}</b></div>;
const tick = (t: string) => t?.slice(5, 10);

function Dashboard() {
  const { d, e } = useApi("/api/dashboard?month=2026-01"); const s = useApi("/api/intervals?month=2026-01");
  if (!d) return <Load e={e} />; const m = d.metrics;
  return <>
    <div className="card"><h3>Procurement insight</h3>{d.insight}<p className="mut">Latest actual in dataset: {d.latest_actual.startTime} — {fmt(d.latest_actual.actual)} MW</p></div>
    <div className="grid"><Kpi l="MAE" v={m.mae} u=" MW" /><Kpi l="RMSE" v={m.rmse} u=" MW" /><Kpi l="sMAPE" v={m.smape} u="%" />
      <Kpi l="Bias (fcst − actual)" v={m.bias} u=" MW" /><Kpi l="Avg forecast age" v={m.freshness_h} u=" h" /></div>
    <Series s={s} />
  </>;
}
function Series({ s }: any) {
  if (!s.d) return <Load e={s.e} />;
  const data = s.d.map((r: any) => ({ ...r, band: r.low == null ? null : [r.low, r.high] }));
  return <div className="card"><h3>Actual vs day-ahead forecast (with P10–P90 band)</h3><ResponsiveContainer height={340}>
    <ComposedChart data={data}><CartesianGrid strokeOpacity={.1} /><XAxis dataKey="t" tickFormatter={tick} minTickGap={50} {...AX} /><YAxis unit=" MW" width={80} {...AX} /><Tooltip {...TT} /><Legend wrapperStyle={{ color: "#8b9ab3" }} />
      <Area dataKey="band" name="Uncertainty band" stroke="none" fill="#35e0b5" fillOpacity={.15} />
      <Line dataKey="forecast" name="Forecast" dot={false} stroke="#6aa8ff" /><Line dataKey="actual" name="Actual" dot={false} stroke="#35e0b5" /></ComposedChart></ResponsiveContainer></div>;
}
function Explorer() {
  const [date, setDate] = useState("2026-01-15"); const [slot, setSlot] = useState(24); const [cut, setCut] = useState("2026-01-14T09:00");
  const start = `${date}T${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}:00Z`;
  const { d, e } = useApi(`/api/forecast/latest?start=${start}&cutoff=${cut}:00Z`);
  return <div className="card"><h3>Forecast explorer</h3>
    <div className="fields">
      <Field label="Delivery date" icon={Cal}><input type="date" min="2026-01-01" max="2026-01-31" value={date} onClick={pop} onChange={x => setDate(x.target.value)} /></Field>
      <Field label="Half-hour interval" icon={Clk}><select value={slot} onChange={x => setSlot(+x.target.value)}>{[...Array(48)].map((_, i) => <option key={i} value={i}>{String(Math.floor(i / 2)).padStart(2, "0")}:{i % 2 ? "30" : "00"}</option>)}</select></Field>
      <Field label="Decision cutoff (UTC)" icon={Cal}><input type="datetime-local" value={cut} onClick={pop} onChange={x => setCut(x.target.value)} /></Field>
    </div>
    {!d ? <Load e={e} /> : <>
      <p>Latest at cutoff: <b>{d.latest ? `${fmt(d.latest.forecast)} MW (published ${d.latest.published})` : "none published yet"}</b> · Actual: <b>{fmt(d.actual)} MW</b></p>
      <ResponsiveContainer height={240}><ComposedChart data={d.history}><XAxis dataKey="published" tickFormatter={(t: string) => t.slice(5, 13)} {...AX} /><YAxis {...AX} /><Tooltip {...TT} /><Line dataKey="forecast" stroke="#6aa8ff" /></ComposedChart></ResponsiveContainer>
      <table><thead><tr><th>Published</th><th>Forecast MW</th><th>Available at cutoff</th></tr></thead><tbody>
        {d.history.map((r: any) => <tr key={r.published} className={r.is_latest ? "latest" : ""}><td>{r.published}</td><td>{fmt(r.forecast)}</td><td>{r.is_latest ? "✔ latest" : r.available ? "yes" : "no (after cutoff)"}</td></tr>)}</tbody></table></>}
  </div>;
}
function Analytics() {
  const { d, e } = useApi("/api/analysis/errors?month=2026-01"); const s = useApi("/api/intervals?month=2026-01");
  if (!d) return <Load e={e} />;
  const slots = d.by_slot.map((r: any) => ({ ...r, label: `${String(Math.floor(r.key / 2)).padStart(2, "0")}:${r.key % 2 ? "30" : "00"}` }));
  const sorted = [...d.daily].sort((x: any, y: any) => y.mae - x.mae); const worst = sorted[0], best = sorted[sorted.length - 1];
  const Stat = ({ l, x }: any) => <div className="card kpi"><span>{l}</span><b>{x.key.slice(5)}</b><small>{fmt(x.mae)} MW MAE · bias {fmt(x.bias)} MW</small></div>;
  const Box = ({ t, h, children }: any) => <div className="card"><h3>{t}</h3><div className="mut" style={{ marginTop: -6, marginBottom: 8 }}>{h}</div><ResponsiveContainer height={260}>{children}</ResponsiveContainer></div>;
  return <>
    <div className="grid"><Stat l="Hardest day to forecast" x={worst} /><Stat l="Easiest day to forecast" x={best} /></div>
    {s.d && <Box t="Forecast error over time" h="Forecast − actual, MW. Above zero = over-forecast (wind fell short)."><AreaChart data={s.d}><CartesianGrid strokeOpacity={.1} />
      <XAxis dataKey="t" tickFormatter={tick} minTickGap={50} {...AX} /><YAxis width={60} {...AX} /><Tooltip {...TT} /><ReferenceLine y={0} stroke="#8b9ab3" />
      <Area dataKey="error" name="Error (MW)" type="monotone" stroke="#ff8a6a" fill="#ff8a6a" fillOpacity={.25} dot={false} connectNulls isAnimationActive={false} /></AreaChart></Box>}
    <div className="two">
      <Box t="Daily MAE" h="Mean absolute error per delivery day (MW)"><BarChart data={d.daily}><CartesianGrid strokeOpacity={.1} vertical={false} />
        <XAxis dataKey="key" tickFormatter={(k: string) => k.slice(8)} interval={0} {...AX} /><YAxis width={50} {...AX} /><Tooltip {...TT} /><Bar dataKey="mae" name="MAE (MW)" fill="#6aa8ff" radius={[4, 4, 0, 0]} /></BarChart></Box>
      <Box t="Absolute error distribution" h="Number of half-hours per error size (MW)"><BarChart data={d.hist}><CartesianGrid strokeOpacity={.1} vertical={false} />
        <XAxis dataKey="range" angle={-30} textAnchor="end" height={55} interval={0} {...AX} /><YAxis width={50} {...AX} /><Tooltip {...TT} /><Bar dataKey="count" name="Intervals" fill="#35e0b5" radius={[4, 4, 0, 0]} /></BarChart></Box>
    </div>
    <Box t="Error by time of day" h="MAE per half-hour slot, averaged over January (UTC)"><BarChart data={slots}><CartesianGrid strokeOpacity={.1} vertical={false} />
      <XAxis dataKey="label" interval={3} {...AX} /><YAxis width={50} {...AX} /><Tooltip {...TT} /><Bar dataKey="mae" name="MAE (MW)" fill="#a78bfa" radius={[3, 3, 0, 0]} /></BarChart></Box>
  </>;
}
function Procurement() {
  const { d, e } = useApi("/api/dashboard?month=2026-01"); if (!d) return <Load e={e} />;
  return <><div className="grid">{Object.entries(d.buffers).map(([k, v]: any) => <Kpi key={k} l={`${k} buffer`} v={v} u=" MW" />)}</div>
    <div className="card"><h3>What the buffer means</h3>Historical shortfall (forecast − actual, when positive) at the 50th / 75th / 90th percentile. Subtracting it from the forecast gives wind you could rely on in that share of half-hours; the gap is a proxy for extra non-wind cover.</div>
    <div className="card"><h3>What it does not mean</h3>It is not a procurement volume. No demand, price or weather data is used, and one month of history is a small sample. Spreads are national-level only.</div></>;
}
function Method() {
  const { d } = useApi("/api/metadata");
  return <div className="card"><h3>Methodology</h3><ul>
    <li>Actuals: Elexon FUELHH, fuelType=WIND. Forecasts: WINDFOR. Delivery dates 1–31 Jan 2026.</li>
    <li>Timestamps parsed as UTC (equals UK local time in January).</li>
    <li><b>Latest forecast rule:</b> for each delivery interval, the forecast with the greatest publishTime ≤ 09:00 UTC on the previous day.</li>
    <li>Error = forecast − actual. MAE, RMSE, sMAPE (2|e|/(|a|+|f|)), bias are over intervals with both values.</li>
    <li>Cleaning: nulls/malformed/negative dropped; duplicates dropped (keep last); intervals without an eligible forecast are counted, not filled.</li>
    <li>Buffer: percentile of historical positive shortfall, in-sample (no out-of-sample test).</li></ul>
    <pre className="mut">{d && JSON.stringify(d.cleaning, null, 1)}</pre></div>;
}
const tabs: any = { Dashboard, Explorer, Analytics, Procurement, Methodology: Method };
export default function App() {
  const [tab, setTab] = useState("Dashboard"); const [light, setLight] = useState(false); const T = tabs[tab];
  useEffect(() => { document.documentElement.classList.toggle("light", light); }, [light]);
  return <div className="wrap"><header><h2>⚡ Wind Forecast Pilot · Jan 2026</h2>
    <nav>{Object.keys(tabs).map(t => <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}
      <a className="btn" href={`${API}/api/export/csv?month=2026-01`}>CSV {Dl}</a><button onClick={() => setLight(!light)}>{light ? "🌙" : "☀️"}</button></nav></header><T /></div>;
}
