// ModelPerformanceComparison.js
import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Brush
} from 'recharts';

/* =========================================================================
 * CONFIG
 * ========================================================================= */
const API_BASE = 'http://localhost:3000/api';
const COUNTRY_TO_MARKET = { TH: 'Thailand', USA: 'America' };
const DEFAULT_COUNTRY = 'TH';

// ตอนนี้ยัง mock ไว้ก่อน; โมเดลเสร็จแล้วสลับเป็น true เพื่อใช้ /api/model-performance
const USE_SERVER_PERFORMANCE = false;

// window + limit ที่ใช้ดึงข้อมูล
const WINDOWS = [
  { key: '7D', label: '7D', limit: 8 },
  { key: '1M', label: '1M', limit: 22 },
  { key: '3M', label: '3M', limit: 66 },
  { key: 'ALL', label: 'All', limit: 320 },
];

// กำหนดขนาดหน้าต่าง rolling MAPE แบบไดนามิกต่อ window
const ROLLING_BARS_BY_WINDOW = {
  '7D': 3,
  '1M': 7,
  '3M': 14,
  'ALL': 14,
};

const ALL_MODE_MAX_SYMBOLS = 12; // จำกัดจำนวนหุ้นในโหมด ALL เพื่อความไว UI

const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

/* =========================================================================
 * HELPERS & METRICS
 * ========================================================================= */
const safeDivide = (num, den) => (den ? num / den : 0);
const fmt = (v, d = 4) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const fmtPct = (v, d = 4) => (v == null || Number.isNaN(v) ? '—' : `${Number(v).toFixed(d)}%`);

const ema = (arr, period) => {
  if (!arr?.length) return [];
  const out = new Array(arr.length).fill(null);
  const k = 2 / (period + 1);
  let prev = arr[0];
  out[0] = prev;
  for (let i = 1; i < arr.length; i++) {
    prev = arr[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
};

// === mock prediction (ใช้จนกว่าโมเดลจริงจะพร้อม)
function buildMockPredictions(actual) {
  const lstmRaw = ema(actual, 3);
  const lstm = lstmRaw.map((v, i) => (v == null ? null : v * (1 + (i % 7 === 0 ? 0.001 : 0))));
  const gru = ema(actual, 5);
  const ensemble = actual.map((_, i) => {
    const a = lstm[i], b = gru[i];
    if (a == null || b == null) return null;
    return (a + b) / 2;
  });
  return { lstm, gru, ensemble };
}

const calcRMSE = (actual, pred) => {
  const A = actual.filter((_, i) => pred[i] != null);
  const P = pred.filter(v => v != null);
  if (!A.length || A.length !== P.length) return null;
  const mse = A.reduce((acc, v, i) => acc + Math.pow(v - P[i], 2), 0) / A.length;
  return Math.sqrt(mse);
};
const calcMAPE = (actual, pred) => {
  const A = actual.filter((_, i) => pred[i] != null);
  const P = pred.filter(v => v != null);
  if (!A.length || A.length !== P.length) return null;
  const mape = A.reduce((acc, v, i) => acc + Math.abs(safeDivide(v - P[i], v || 1)), 0) / A.length;
  return mape * 100;
};
const calcTrendAccuracy = (actual, pred) => {
  const N = actual.length;
  if (N < 2 || pred.length < 2) return null;
  let correct = 0, total = 0;
  for (let i = 1; i < N; i++) {
    if (pred[i] == null || pred[i - 1] == null) continue;
    const aUp = actual[i] > actual[i - 1];
    const pUp = pred[i] > pred[i - 1];
    if (aUp === pUp) correct++;
    total++;
  }
  return total ? (correct / total) * 100 : null;
};

// ===== Rolling helpers =====
const rollingMean = (arr, win = 14) => {
  const out = new Array(arr.length).fill(null);
  let sum = 0, q = [];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v == null) { q = []; sum = 0; continue; } // break window when null
    q.push(v); sum += v;
    if (q.length > win) sum -= q.shift();
    if (q.length === win) out[i] = sum / win;
  }
  return out;
};

// data สำหรับกราฟ/ตาราง
function buildChartRows(perfRows = []) {
  return perfRows.map(r => {
    const absL = Math.abs(r.actual - r.lstm);
    const absG = Math.abs(r.actual - r.gru);
    const absE = Math.abs(r.actual - r.ensemble);
    const best = (() => {
      const m = Math.min(absL, absG, absE);
      if (m === absE) return 'ENSEMBLE';
      if (m === absG) return 'GRU';
      return 'LSTM';
    })();
    return {
      date: r.date,
      actual: r.actual,
      LSTM: r.lstm,
      GRU: r.gru,
      ENSEMBLE: r.ensemble,
      errL: absL,
      errG: absG,
      errE: absE,
      best
    };
  });
}

/* =========================================================================
 * STYLED
 * ========================================================================= */
const MainContent = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center;
  overflow-y: auto; padding: 20px; color: #e0e0e0;
`;
const Header = styled.header`
  width: 100%; background: #ff8c00; padding: 15px; text-align: center; color: white;
  font-size: 28px; font-weight: bold; box-shadow: 0 4px 8px rgba(255,140,0,0.4);
  border-radius: 10px; margin-bottom: 20px;
`;
const Container = styled.div`
  background: #1e1e1e; padding: 25px; border-radius: 12px; width: 100%;
  max-width: 1400px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); border: 1px solid #333;
`;
const SectionTitle = styled.h3`
  color: #ff8c00; margin: 0 0 16px 0; font-size: 22px; border-bottom: 2px solid #ff8c00; padding-bottom: 10px;
`;
const Controls = styled.div`
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 18px;
`;
const Select = styled.select`
  padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.3); outline: none;
  background: #333; color: white; font-size: 14px; font-weight: bold;
`;
const Grid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;
`;
const MetricCard = styled.div`
  background: #2a2a2a; border-radius: 12px; padding: 16px; border-left: 5px solid ${p => p.color || '#ff8c00'};
`;
const MetricHeader = styled.div`
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
  color: #e0e0e0; font-weight: bold;
`;
const MetricValue = styled.div`
  display: flex; gap: 16px; color: #cfcfcf; font-size: 14px;
  span strong { color: #ff8c00; margin-right: 6px; }
`;
const Panel = styled.div`
  background:#2a2a2a; border:1px solid #333; border-radius:12px; padding:12px;
`;
const PanelsGrid = styled.div`
  display:grid; grid-template-columns: 1.5fr 1fr; gap:16px;
  @media (max-width: 1100px){ grid-template-columns: 1fr; }
`;
const TableWrap = styled.div`
  background: #2a2a2a; border-radius: 12px; padding: 16px; margin-top: 18px; overflow: auto;
  border: 1px solid #333;
`;
const Table = styled.table`
  width: 100%; border-collapse: collapse; font-size: 14px;
  th, td { padding: 10px; border-bottom: 1px solid #3a3a3a; }
  th { color: #ff8c00; text-transform: uppercase; font-size: 12px; text-align: left; }
  tbody tr:hover { background: #313131; }
`;
const LegendRow = styled.div`
  display: flex; gap: 8px; align-items: center; color: #a0a0a0; font-size: 12px; margin-top: 8px;
  span.badge { padding: 4px 8px; border-radius: 6px; background: #404040; color: #ddd; }
`;
const BestCell = styled.td`
  font-weight: 800;
  background: linear-gradient(90deg, rgba(255, 217, 102, 0.22), rgba(255, 140, 0, 0.12));
  border-radius: 6px;
`;
const COLOR = { LSTM: '#0dcaf0', GRU: '#20c997', ENSEMBLE: '#ff8c00' };

/* =========================================================================
 * COMPONENT
 * ========================================================================= */
export default function ModelPerformanceComparison() {
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [symbols, setSymbols] = useState([]);     // [{symbol,name}]
  const [symbol, setSymbol] = useState('');
  const [windowKey, setWindowKey] = useState('7D');

  const [series, setSeries] = useState([]);       // [{date, actual}]
  const [perf, setPerf] = useState(null);
  const [allPerf, setAllPerf] = useState([]);     // โหมด ALL: [{symbol, LSTM:{...}, GRU:{...}, ENSEMBLE:{...}}]
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const isAll = symbol === 'ALL';
  const rollingBars = ROLLING_BARS_BY_WINDOW[windowKey] || 14;

  // โหลดรายชื่อหุ้นจริงตามตลาด
  useEffect(() => {
    const run = async () => {
      try {
        setErr('');
        const market = COUNTRY_TO_MARKET[country];
        const url = `${API_BASE}/market-trend/symbols?market=${encodeURIComponent(market)}`;
        const { data } = await axios.get(url, getAuthHeaders());
        const list = (data?.data || []).map(r => ({ symbol: r.StockSymbol, name: r.CompanyName || r.StockSymbol }));
        setSymbols(list);
        // default: ถ้ามีสัญลักษณ์ ให้เซ็ตตัวแรก, ถ้าไม่มี ให้เคลียร์
        setSymbol(list[0]?.symbol || '');
      } catch (e) {
        console.error(e);
        setErr(e?.response?.data?.error || 'โหลดรายชื่อหุ้นไม่สำเร็จ');
        setSymbols([]); setSymbol('');
      }
    };
    run();
  }, [country]);

  // โหลดราคาจริง + performance (server หรือ mock) — รองรับทั้งโหมดปกติและโหมด ALL
  useEffect(() => {
    const controller = new AbortController();

    const fetchOneSymbolPerf = async (sym, limit) => {
      const url = `${API_BASE}/market-trend/data?symbol=${encodeURIComponent(sym)}&limit=${limit}`;
      const { data } = await axios.get(url, { ...getAuthHeaders(), signal: controller.signal });
      const s = (data?.series || []).map(r => ({ date: r.date, actual: Number(r.ClosePrice) }));

      if (USE_SERVER_PERFORMANCE && s.length > 1) {
        const start = s[0].date, end = s[s.length - 1].date;
        const perfUrl = `${API_BASE}/model-performance?symbol=${encodeURIComponent(sym)}&start=${start}&end=${end}`;
        const { data: perfResp } = await axios.get(perfUrl, getAuthHeaders());
        const rows = perfResp?.data || [];
        const A = rows.map(r => Number(r.ClosePrice));
        const L = rows.map(r => Number(r.PredictionClose_LSTM));
        const G = rows.map(r => Number(r.PredictionClose_GRU));
        const E = rows.map(r => Number(r.PredictionClose_Ensemble));
        return {
          rows: rows.map(r => ({
            date: r.Date?.slice(0,10) || r.date,
            actual: Number(r.ClosePrice),
            lstm: Number(r.PredictionClose_LSTM),
            gru: Number(r.PredictionClose_GRU),
            ensemble: Number(r.PredictionClose_Ensemble),
          })),
          metrics: {
            LSTM: { RMSE: calcRMSE(A, L), MAPE: calcMAPE(A, L), TrendAcc: calcTrendAccuracy(A, L) },
            GRU:  { RMSE: calcRMSE(A, G), MAPE: calcMAPE(A, G), TrendAcc: calcTrendAccuracy(A, G) },
            ENSEMBLE: { RMSE: calcRMSE(A, E), MAPE: calcMAPE(A, E), TrendAcc: calcTrendAccuracy(A, E) },
          }
        };
      } else {
        const { lstm, gru, ensemble } = buildMockPredictions(s.map(x => x.actual));
        const A = s.map(x => x.actual), L = lstm, G = gru, E = ensemble;
        return {
          rows: s.map((r, i) => ({
            date: r.date, actual: r.actual,
            lstm: L[i] ?? r.actual, gru: G[i] ?? r.actual, ensemble: E[i] ?? r.actual,
          })),
          metrics: {
            LSTM: { RMSE: calcRMSE(A, L), MAPE: calcMAPE(A, L), TrendAcc: calcTrendAccuracy(A, L) },
            GRU:  { RMSE: calcRMSE(A, G), MAPE: calcMAPE(A, G), TrendAcc: calcTrendAccuracy(A, G) },
            ENSEMBLE: { RMSE: calcRMSE(A, E), MAPE: calcMAPE(A, E), TrendAcc: calcTrendAccuracy(A, E) },
          }
        };
      }
    };

    (async () => {
      try {
        setLoading(true); setErr('');
        setSeries([]); setPerf(null); setAllPerf([]);

        const { limit } = WINDOWS.find(w => w.key === windowKey) || WINDOWS[0];

        if (!symbol) { setLoading(false); return; }

        if (isAll) {
          // โหมด ALL: วิ่ง metric ให้หลายตัวพร้อมกัน
          const pick = symbols.slice(0, ALL_MODE_MAX_SYMBOLS).map(s => s.symbol);
          if (!pick.length) { setLoading(false); return; }

          const results = await Promise.allSettled(pick.map(sym => fetchOneSymbolPerf(sym, limit)));
          const packed = results.map((res, idx) => {
            const sym = pick[idx];
            if (res.status !== 'fulfilled' || !res.value) return null;
            const { metrics } = res.value;
            // เลือก best model ตามค่า MAPE ต่ำสุด
            const mapeTriplet = [
              { model: 'LSTM', value: metrics.LSTM?.MAPE ?? Infinity },
              { model: 'GRU', value: metrics.GRU?.MAPE ?? Infinity },
              { model: 'ENSEMBLE', value: metrics.ENSEMBLE?.MAPE ?? Infinity },
            ].sort((a,b)=>a.value-b.value);
            return {
              symbol: sym,
              LSTM: metrics.LSTM, GRU: metrics.GRU, ENSEMBLE: metrics.ENSEMBLE,
              bestModel: mapeTriplet[0]?.model || '—',
              bestMAPE: mapeTriplet[0]?.value ?? null,
            };
          }).filter(Boolean);

          // เรียงจาก MAPE ของ ENSEMBLE ต่ำสุดขึ้นก่อน (ถ้าข้อมูลว่าง ใช้ Infinity)
          packed.sort((a,b)=> (a.ENSEMBLE?.MAPE ?? Infinity) - (b.ENSEMBLE?.MAPE ?? Infinity));
          setAllPerf(packed);
        } else {
          // โหมดสัญลักษณ์เดียว
          const data = await fetchOneSymbolPerf(symbol, limit);
          setPerf({
            LSTM: data.metrics.LSTM,
            GRU: data.metrics.GRU,
            ENSEMBLE: data.metrics.ENSEMBLE,
            rows: data.rows,
          });
          setSeries(data.rows.map(r => ({ date: r.date, actual: r.actual })));
        }
      } catch (e) {
        if (e.name === 'CanceledError') return;
        console.error(e);
        setErr(e?.response?.data?.error || 'โหลดข้อมูลไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [symbol, windowKey, symbols]);

  const stockOptions = useMemo(() => symbols.map(s => s.symbol), [symbols]);
  const v = (x) => fmt(x, 4);
  const vPct = (x) => fmtPct(x, 4);

  // rows สำหรับกราฟ/ตาราง + rolling MAPE (ใช้จำนวน bars แบบไดนามิก)
  const chartRows = useMemo(() => perf ? buildChartRows(perf.rows) : [], [perf]);
  const rollingMape = useMemo(() => {
    if (!perf?.rows?.length) return [];
    const A = perf.rows.map(r => r.actual);
    const L = perf.rows.map(r => r.lstm);
    const G = perf.rows.map(r => r.gru);
    const E = perf.rows.map(r => r.ensemble);
    // ระวังกรณี A[i] === 0 อย่าใช้ !A[i]
    const mL = L.map((p,i)=> (p==null || A[i]==null || A[i]===0 ? null : Math.abs((A[i]-p)/A[i])*100));
    const mG = G.map((p,i)=> (p==null || A[i]==null || A[i]===0 ? null : Math.abs((A[i]-p)/A[i])*100));
    const mE = E.map((p,i)=> (p==null || A[i]==null || A[i]===0 ? null : Math.abs((A[i]-p)/A[i])*100));
    const rL = rollingMean(mL, rollingBars);
    const rG = rollingMean(mG, rollingBars);
    const rE = rollingMean(mE, rollingBars);
    return perf.rows.map((r, i) => ({ date: r.date, LSTM: rL[i], GRU: rG[i], ENSEMBLE: rE[i] }));
  }, [perf, rollingBars]);

  // โหมด ALL: rows สำหรับกราฟแท่ง (MAPE ของ Ensemble ต่อสัญลักษณ์)
  const allBarRows = useMemo(() => {
    if (!allPerf?.length) return [];
    return allPerf.map(x => ({
      symbol: x.symbol,
      LSTM: x.LSTM?.MAPE ?? null,
      GRU: x.GRU?.MAPE ?? null,
      ENSEMBLE: x.ENSEMBLE?.MAPE ?? null,
    }));
  }, [allPerf]);

  return (
    <MainContent>
      <Header>Model Performance Comparison</Header>
      <Container>
        <SectionTitle>Controls</SectionTitle>
        <Controls>
          <label style={{ fontWeight: 'bold' }}>Market:</label>
          <Select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="TH">Thailand (TH)</option>
            <option value="USA">United States (USA)</option>
          </Select>

          <label style={{ fontWeight: 'bold' }}>Symbol:</label>
          <Select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {/* เพิ่ม ALL (Leaderboard) */}
            {stockOptions.length > 1 && <option value="ALL">ALL (Leaderboard)</option>}
            {stockOptions.map(sym => <option key={sym} value={sym}>{sym}</option>)}
          </Select>

          <label style={{ fontWeight: 'bold' }}>Window:</label>
          <Select value={windowKey} onChange={(e) => setWindowKey(e.target.value)}>
            {WINDOWS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
          </Select>
        </Controls>

        {err && <p style={{ color: '#dc3545', marginBottom: 12 }}>{err}</p>}
        {loading && <p style={{ color: '#a0a0a0' }}>Loading...</p>}

        {/* ========================= ALL MODE ========================= */}
        {isAll ? (
          <>
            <SectionTitle>Market Leaderboard (ALL)</SectionTitle>
            {(!allPerf || allPerf.length === 0) ? (
              !loading && <p style={{ color: '#a0a0a0' }}>No data</p>
            ) : (
              <>
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>RMSE (LSTM)</th>
                        <th>RMSE (GRU)</th>
                        <th>RMSE (Ensemble)</th>
                        <th>MAPE (LSTM)</th>
                        <th>MAPE (GRU)</th>
                        <th>MAPE (Ensemble)</th>
                        <th>TrendAcc (LSTM)</th>
                        <th>TrendAcc (GRU)</th>
                        <th>TrendAcc (Ensemble)</th>
                        <th>Best (by MAPE)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allPerf.map((row) => (
                        <tr key={row.symbol}>
                          <td style={{ fontWeight: 700 }}>{row.symbol}</td>
                          <td>{fmt(row.LSTM?.RMSE, 4)}</td>
                          <td>{fmt(row.GRU?.RMSE, 4)}</td>
                          <td>{fmt(row.ENSEMBLE?.RMSE, 4)}</td>
                          <td style={{ color: COLOR.LSTM }}>{fmt(row.LSTM?.MAPE, 4)}</td>
                          <td style={{ color: COLOR.GRU }}>{fmt(row.GRU?.MAPE, 4)}</td>
                          <td style={{ color: COLOR.ENSEMBLE, fontWeight: 700 }}>{fmt(row.ENSEMBLE?.MAPE, 4)}</td>
                          <td>{fmtPct(row.LSTM?.TrendAcc, 2)}</td>
                          <td>{fmtPct(row.GRU?.TrendAcc, 2)}</td>
                          <td>{fmtPct(row.ENSEMBLE?.TrendAcc, 2)}</td>
                          <td style={{ fontWeight: 700 }}>{row.bestModel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>

                <Panel style={{ marginTop: 16 }}>
                  <SectionTitle style={{ borderBottom:'none', margin:0, paddingBottom:8 }}>
                    Ensemble MAPE by Symbol (Lower is Better)
                  </SectionTitle>
                  <div style={{ height: 360 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={allBarRows} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="symbol" tick={{ fill: '#bdbdbd' }} />
                        <YAxis tick={{ fill: '#bdbdbd' }} />
                        <Tooltip contentStyle={{ background:'#2a2a2a', border:'1px solid #444', color:'#eee' }} />
                        <Legend />
                        <Bar dataKey="ENSEMBLE" name="MAPE (Ensemble)" fill={COLOR.ENSEMBLE} />
                        <Brush dataKey="symbol" height={24} travellerWidth={12} stroke="#666" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <LegendRow>
                  <span className="badge">Predictions: {USE_SERVER_PERFORMANCE ? 'Server /api/model-performance' : 'Mock (EMA-based)'}</span>
                  <span className="badge">Window: {WINDOWS.find(w => w.key === windowKey)?.label}</span>
                </LegendRow>
              </>
            )}
          </>
        ) : (
          /* ========================= SINGLE SYMBOL MODE ========================= */
          <>
            {perf ? (
              <>
                <SectionTitle>Summary Metrics</SectionTitle>
                <Grid>
                  <MetricCard color={COLOR.LSTM}>
                    <MetricHeader>
                      <span>LSTM</span>
                      <span style={{ color: '#9adcf0' }}>Recurrent</span>
                    </MetricHeader>
                    <MetricValue>
                      <span><strong>RMSE:</strong> {fmt(perf.LSTM.RMSE,4)}</span>
                      <span><strong>MAPE:</strong> {fmtPct(perf.LSTM.MAPE,4)}</span>
                      <span><strong>Trend Acc:</strong> {fmtPct(perf.LSTM.TrendAcc,4)}</span>
                    </MetricValue>
                  </MetricCard>

                  <MetricCard color={COLOR.GRU}>
                    <MetricHeader>
                      <span>GRU</span>
                      <span style={{ color: '#96e6d1' }}>Recurrent</span>
                    </MetricHeader>
                    <MetricValue>
                      <span><strong>RMSE:</strong> {fmt(perf.GRU.RMSE,4)}</span>
                      <span><strong>MAPE:</strong> {fmtPct(perf.GRU.MAPE,4)}</span>
                      <span><strong>Trend Acc:</strong> {fmtPct(perf.GRU.TrendAcc,4)}</span>
                    </MetricValue>
                  </MetricCard>

                  <MetricCard color={COLOR.ENSEMBLE}>
                    <MetricHeader>
                      <span>Ensemble (XGBoost)</span>
                      <span style={{ color: '#ffc58a' }}>Tree-based</span>
                    </MetricHeader>
                    <MetricValue>
                      <span><strong>RMSE:</strong> {fmt(perf.ENSEMBLE.RMSE,4)}</span>
                      <span><strong>MAPE:</strong> {fmtPct(perf.ENSEMBLE.MAPE,4)}</span>
                      <span><strong>Trend Acc:</strong> {fmtPct(perf.ENSEMBLE.TrendAcc,4)}</span>
                    </MetricValue>
                  </MetricCard>
                </Grid>

                <LegendRow>
                  <span className="badge">Actual = Close Price</span>
                  <span className="badge">
                    Predictions: {USE_SERVER_PERFORMANCE ? 'Server /api/model-performance' : 'Mock (EMA-based)'}
                  </span>
                  <span className="badge">Window: {WINDOWS.find(w => w.key === windowKey)?.label}</span>
                  <span className="badge">Rolling: {rollingBars} bars</span>
                  <span className="badge">Highlight in table = Daily best (min |error|)</span>
                </LegendRow>

                {/* CHARTS */}
                <PanelsGrid style={{ marginTop: 22 }}>
                  <Panel>
                    <SectionTitle style={{ borderBottom:'none', margin:0, paddingBottom:8 }}>Actual vs Predictions</SectionTitle>
                    <div style={{ height: 340 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="date" tick={{ fill: '#bdbdbd' }} />
                          <YAxis tick={{ fill: '#bdbdbd' }} />
                          <Tooltip contentStyle={{ background:'#2a2a2a', border:'1px solid #444', color:'#eee' }} />
                          <Legend />
                          <Line type="monotone" dataKey="actual" name="Actual" stroke="#9e9e9e" strokeWidth={2} dot={false}/>
                          <Line type="monotone" dataKey="LSTM"  name="LSTM"  stroke={COLOR.LSTM} strokeWidth={2} dot={false}/>
                          <Line type="monotone" dataKey="GRU"   name="GRU"   stroke={COLOR.GRU} strokeWidth={2} dot={false}/>
                          <Line type="monotone" dataKey="ENSEMBLE" name="Ensemble" stroke={COLOR.ENSEMBLE} strokeWidth={2} dot={false}/>
                          <Brush dataKey="date" height={24} travellerWidth={12} stroke="#666" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>

                  <Panel>
                    <SectionTitle style={{ borderBottom:'none', margin:0, paddingBottom:8 }}>
                      Rolling MAPE ({rollingBars} bars)
                    </SectionTitle>
                    <div style={{ height: 340 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={rollingMape} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="date" tick={{ fill: '#bdbdbd' }} />
                          <YAxis tick={{ fill: '#bdbdbd' }} unit="%" />
                          <Tooltip contentStyle={{ background:'#2a2a2a', border:'1px solid #444', color:'#eee' }} />
                          <Legend />
                          <Line type="monotone" dataKey="LSTM" stroke={COLOR.LSTM} strokeWidth={2} dot={false}/>
                          <Line type="monotone" dataKey="GRU"  stroke={COLOR.GRU} strokeWidth={2} dot={false}/>
                          <Line type="monotone" dataKey="ENSEMBLE" stroke={COLOR.ENSEMBLE} strokeWidth={2} dot={false}/>
                          <Brush dataKey="date" height={24} travellerWidth={12} stroke="#666" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Panel>
                </PanelsGrid>

                <Panel style={{ marginTop: 16 }}>
                  <SectionTitle style={{ borderBottom:'none', margin:0, paddingBottom:8 }}>Daily Absolute Error</SectionTitle>
                  <div style={{ height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="date" tick={{ fill: '#bdbdbd' }} />
                        <YAxis tick={{ fill: '#bdbdbd' }} />
                        <Tooltip contentStyle={{ background:'#2a2a2a', border:'1px solid #444', color:'#eee' }} />
                        <Legend />
                        <Bar dataKey="errL" name="|Err| LSTM" fill={COLOR.LSTM} />
                        <Bar dataKey="errG" name="|Err| GRU"  fill={COLOR.GRU} />
                        <Bar dataKey="errE" name="|Err| Ens."  fill={COLOR.ENSEMBLE} />
                        <Brush dataKey="date" height={24} travellerWidth={12} stroke="#666" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                {/* Table */}
                <SectionTitle style={{ marginTop: 22 }}>Daily Comparison</SectionTitle>
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Actual</th>
                        <th style={{ color: COLOR.LSTM }}>LSTM</th>
                        <th style={{ color: COLOR.GRU }}>GRU</th>
                        <th style={{ color: COLOR.ENSEMBLE }}>Ensemble</th>
                        <th>Abs Err (LSTM)</th>
                        <th>Abs Err (GRU)</th>
                        <th>Abs Err (Ens.)</th>
                        <th>Best (Daily)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartRows.map((r) => {
                        const L = r.errL, G = r.errG, E = r.errE;
                        const min = Math.min(L, G, E);
                        const best = (min === E) ? 'ENSEMBLE' : (min === G ? 'GRU' : 'LSTM');
                        const LstmCell = best === 'LSTM' ? BestCell : 'td';
                        const GruCell  = best === 'GRU' ? BestCell : 'td';
                        const EnsCell  = best === 'ENSEMBLE' ? BestCell : 'td';
                        return (
                          <tr key={r.date}>
                            <td>{r.date}</td>
                            <td>{r.actual != null ? r.actual.toFixed(2) : '—'}</td>
                            <LstmCell style={{ color: COLOR.LSTM }}>{r.LSTM != null ? r.LSTM.toFixed(2) : '—'}</LstmCell>
                            <GruCell  style={{ color: COLOR.GRU }}>{r.GRU != null ? r.GRU.toFixed(2) : '—'}</GruCell>
                            <EnsCell  style={{ color: COLOR.ENSEMBLE }}>{r.ENSEMBLE != null ? r.ENSEMBLE.toFixed(2) : '—'}</EnsCell>
                            <td>{fmt(L, 3)}</td>
                            <td>{fmt(G, 3)}</td>
                            <td>{fmt(E, 3)}</td>
                            <td style={{ fontWeight: 700 }}>{best === 'ENSEMBLE' ? 'Ensemble' : best}</td>
                          </tr>
                        );
                      })}
                      {(!chartRows || chartRows.length === 0) && (
                        <tr><td colSpan="9" style={{ color: '#aaa', textAlign: 'center', padding: 18 }}>No data</td></tr>
                      )}
                    </tbody>
                  </Table>
                </TableWrap>
              </>
            ) : (
              !loading && <p style={{ color: '#a0a0a0' }}>No data</p>
            )}
          </>
        )}
      </Container>
    </MainContent>
  );
}
