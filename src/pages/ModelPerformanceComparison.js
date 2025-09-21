// src/pages/ModelPerformanceComparison.js
import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

/* =========================================================================
 * CONFIG
 * ========================================================================= */
const API_BASE = 'http://localhost:3000/api';
const COUNTRY_TO_MARKET = { TH: 'Thailand', USA: 'America' };

// ✅ ค่าเริ่มต้นของหน้าเสมอ
const DEFAULT_COUNTRY = 'USA';
const DEFAULT_WINDOW  = 'ALL';
const DEFAULT_SYMBOL_BY_COUNTRY = { TH: 'ADVANC', USA: 'AAPL' };

// ใช้ mock จนกว่า /api/model-performance จะพร้อม
const USE_SERVER_PERFORMANCE = true;

// window + limit ที่ใช้ดึงข้อมูล
const WINDOWS = [
  { key: '7D',  label: '7D',  limit: 8  },
  { key: '1M',  label: '1M',  limit: 22 },
  { key: '3M',  label: '3M',  limit: 66 },
  { key: 'ALL', label: 'All', limit: 320 },
];

// ✅ แสดงตารางทีละ 5 แถว + ทำ pagination
const PAGE_SIZE = 5;

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

function buildChartRows(perfRows = []) {
  return perfRows.map(r => {
    const err = (pred) => (pred == null ? Infinity : Math.abs(r.actual - pred));

    const absL = err(r.lstm);
    const absG = err(r.gru);
    const absE = err(r.ensemble);

    const min = Math.min(absL, absG, absE);
    const best = (min === absE) ? 'ENSEMBLE' : (min === absG ? 'GRU' : 'LSTM');

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

/* ✅ Pagination styles */
const PaginationBar = styled.div`
  display:flex; align-items:center; justify-content:center; gap:12px;
  padding: 14px 8px;
`;
const NavButton = styled.button`
  padding: 8px 14px; border-radius: 8px; background: transparent;
  border: 1px solid #ff8c00; color: #ff8c00; font-weight: 800; cursor: pointer;
  &:disabled { opacity: .45; cursor: not-allowed; }
`;
const PageText = styled.span` color:#ddd; `;
const PageInput = styled.input`
  width: 64px; padding: 6px 8px; border-radius: 8px; border: 1px solid #444;
  background:#2a2a2a; color:#fff; text-align:center; font-weight: 700;
`;

/* =========================================================================
 * COMPONENT
 * ========================================================================= */
export default function ModelPerformanceComparison() {
  // ✅ ค่าเริ่มต้นหน้าแรกเสมอ
  const [country,   setCountry]   = useState(DEFAULT_COUNTRY);
  const [windowKey, setWindowKey] = useState(DEFAULT_WINDOW);
  const [symbol,    setSymbol]    = useState(DEFAULT_SYMBOL_BY_COUNTRY[DEFAULT_COUNTRY] || '');

  const [symbols, setSymbols] = useState([]); // [{symbol,name}]
  const [perf, setPerf]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  // ✅ pagination states สำหรับตาราง
  const [page, setPage] = useState(1);
  const [pageDraft, setPageDraft] = useState('1');
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  /* ---------- โหลดรายชื่อหุ้นตามประเทศ ---------- */
  useEffect(() => {
    const run = async () => {
      try {
        setErr('');
        const market = COUNTRY_TO_MARKET[country];
        const url = `${API_BASE}/market-trend/symbols?market=${encodeURIComponent(market)}`;
        const { data } = await axios.get(url, getAuthHeaders());
        const list = (data?.data || []).map(r => ({ symbol: r.StockSymbol, name: r.CompanyName || r.StockSymbol }));
        setSymbols(list);

        // เลือก symbol เริ่มต้นของประเทศ ถ้ามีอยู่ในลิสต์ ไม่งั้นเลือกตัวแรก
        const preferred = DEFAULT_SYMBOL_BY_COUNTRY[country];
        const hasPreferred = list.some(x => x.symbol === preferred);
        setSymbol(hasPreferred ? preferred : (list[0]?.symbol || ''));

        // ทุกครั้งที่เปลี่ยนประเทศ รีเซ็ต window + pagination เป็นค่าเริ่มต้นเสมอ
        setWindowKey(DEFAULT_WINDOW);
        setPage(1); setPageDraft('1');
      } catch (e) {
        console.error(e);
        setErr(e?.response?.data?.error || 'โหลดรายชื่อหุ้นไม่สำเร็จ');
        setSymbols([]); setSymbol('');
      }
    };
    run();
  }, [country]);

  /* ---------- โหลดข้อมูล/คำนวณ metrics ของสัญลักษณ์เดียว ---------- */
  useEffect(() => {
    const controller = new AbortController();

const fetchOneSymbolPerf = async (sym, limit) => {
  const url = `${API_BASE}/market-trend/data?symbol=${encodeURIComponent(sym)}&limit=${limit}`;
  const { data } = await axios.get(url, getAuthHeaders());
  const s = (data?.series || []).map(r => ({ date: r.date, actual: Number(r.ClosePrice) }));

  if (USE_SERVER_PERFORMANCE && s.length > 1) {
    const start = s[0].date, end = s[s.length - 1].date;
    const perfUrl = `${API_BASE}/model-performance?symbol=${encodeURIComponent(sym)}&start=${start}&end=${end}`;
    const { data: perfResp } = await axios.get(perfUrl, getAuthHeaders());
    const rows = perfResp?.data || [];

    const numOrNull = (x) => (x == null ? null : Number(x));
    const toDateStr = (d) => {
      if (!d) return '';
      if (typeof d === 'string') return d.slice(0,10);
      try { return new Date(d).toISOString().slice(0,10); } catch { return ''; }
    };

    const A = rows.map(r => Number(r.ClosePrice));
    const L = rows.map(r => numOrNull(r.PredictionClose_LSTM));
    const G = rows.map(r => numOrNull(r.PredictionClose_GRU));
    const E = rows.map(r => numOrNull(r.PredictionClose_Ensemble));

    return {
      rows: rows.map((r, i) => ({
        date: toDateStr(r.date || r.Date),
        actual: Number(r.ClosePrice),
        lstm: L[i],
        gru: G[i],
        ensemble: E[i],
      })),
      metrics: {
        LSTM:     { RMSE: calcRMSE(A, L), MAPE: calcMAPE(A, L), TrendAcc: calcTrendAccuracy(A, L) },
        GRU:      { RMSE: calcRMSE(A, G), MAPE: calcMAPE(A, G), TrendAcc: calcTrendAccuracy(A, G) },
        ENSEMBLE: { RMSE: calcRMSE(A, E), MAPE: calcMAPE(A, E), TrendAcc: calcTrendAccuracy(A, E) },
      }
    };
  } else {
    const { lstm, gru, ensemble } = buildMockPredictions(s.map(x => x.actual));
    const A = s.map(x => x.actual), L = lstm, G = gru, E = ensemble;
    return {
      rows: s.map((r, i) => ({
        date: r.date, actual: r.actual,
        lstm: L[i] ?? null, gru: G[i] ?? null, ensemble: E[i] ?? null,
      })),
      metrics: {
        LSTM:     { RMSE: calcRMSE(A, L), MAPE: calcMAPE(A, L), TrendAcc: calcTrendAccuracy(A, L) },
        GRU:      { RMSE: calcRMSE(A, G), MAPE: calcMAPE(A, G), TrendAcc: calcTrendAccuracy(A, G) },
        ENSEMBLE: { RMSE: calcRMSE(A, E), MAPE: calcMAPE(A, E), TrendAcc: calcTrendAccuracy(A, E) },
      }
    };
  }
};


    (async () => {
      try {
        setLoading(true); setErr('');
        setPerf(null);

        const { limit } = WINDOWS.find(w => w.key === windowKey) || WINDOWS[0];
        if (!symbol) { setLoading(false); return; }

        const data = await fetchOneSymbolPerf(symbol, limit);
        setPerf({
          LSTM: data.metrics.LSTM,
          GRU: data.metrics.GRU,
          ENSEMBLE: data.metrics.ENSEMBLE,
          rows: data.rows,
        });
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

  // rows สำหรับกราฟ/ตาราง
  const chartRows = useMemo(() => perf ? buildChartRows(perf.rows) : [], [perf]);

  // ✅ reset pagination ไปหน้า 1 เมื่อข้อมูล/ตัวเลือกรายสำคัญเปลี่ยน
  useEffect(() => { setPage(1); setPageDraft('1'); }, [symbol, windowKey, chartRows.length]);

  // ✅ slice แถวตามหน้า
  const totalRows = chartRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = chartRows.slice(start, start + PAGE_SIZE);

  const applyDraftPage = () => {
    const n = parseInt(pageDraft, 10);
    const next = clamp(Number.isFinite(n) ? n : 1, 1, totalPages);
    setPage(next);
    setPageDraft(String(next));
  };

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
            {/* ❌ ไม่มี ALL/Leaderboard แล้ว */}
            {stockOptions.map(sym => <option key={sym} value={sym}>{sym}</option>)}
          </Select>

          <label style={{ fontWeight: 'bold' }}>Window:</label>
          <Select value={windowKey} onChange={(e) => setWindowKey(e.target.value)}>
            {WINDOWS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
          </Select>
        </Controls>

        {err && <p style={{ color: '#dc3545', marginBottom: 12 }}>{err}</p>}
        {loading && <p style={{ color: '#a0a0a0' }}>Loading...</p>}

        {/* ========================= SINGLE SYMBOL ONLY ========================= */}
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
                  <span><strong>RMSE:</strong> {v(perf.LSTM.RMSE)}</span>
                  <span><strong>MAPE:</strong> {vPct(perf.LSTM.MAPE)}</span>
                  <span><strong>Trend Acc:</strong> {vPct(perf.LSTM.TrendAcc)}</span>
                </MetricValue>
              </MetricCard>

              <MetricCard color={COLOR.GRU}>
                <MetricHeader>
                  <span>GRU</span>
                  <span style={{ color: '#96e6d1' }}>Recurrent</span>
                </MetricHeader>
                <MetricValue>
                  <span><strong>RMSE:</strong> {v(perf.GRU.RMSE)}</span>
                  <span><strong>MAPE:</strong> {vPct(perf.GRU.MAPE)}</span>
                  <span><strong>Trend Acc:</strong> {vPct(perf.GRU.TrendAcc)}</span>
                </MetricValue>
              </MetricCard>

              <MetricCard color={COLOR.ENSEMBLE}>
                <MetricHeader>
                  <span>Ensemble (XGBoost)</span>
                  <span style={{ color: '#ffc58a' }}>Tree-based</span>
                </MetricHeader>
                <MetricValue>
                  <span><strong>RMSE:</strong> {v(perf.ENSEMBLE.RMSE)}</span>
                  <span><strong>MAPE:</strong> {vPct(perf.ENSEMBLE.MAPE)}</span>
                  <span><strong>Trend Acc:</strong> {vPct(perf.ENSEMBLE.TrendAcc)}</span>
                </MetricValue>
              </MetricCard>
            </Grid>

            <LegendRow>
              <span className="badge">Actual = Close Price</span>
              <span className="badge">Predictions: {USE_SERVER_PERFORMANCE ? 'Server /api/model-performance' : 'Mock (EMA-based)'}</span>
              <span className="badge">Window: {WINDOWS.find(w => w.key === windowKey)?.label}</span>
            </LegendRow>

            {/* ✅ เหลือแค่ Actual vs Predictions */}
            <Panel style={{ marginTop: 22 }}>
              <SectionTitle style={{ borderBottom:'none', margin:0, paddingBottom:8 }}>Actual vs Predictions</SectionTitle>
              <div style={{ height: 360 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="date" tick={{ fill: '#bdbdbd' }} />
                    <YAxis tick={{ fill: '#bdbdbd' }} />
                    <Tooltip contentStyle={{ background:'#2a2a2a', border:'1px solid #444', color:'#eee' }} />
                    <Legend />
                    <Line type="monotone" dataKey="actual"    name="Actual"    stroke="#9e9e9e"     strokeWidth={2} dot={false}/>
                    <Line type="monotone" dataKey="LSTM"      name="LSTM"      stroke={COLOR.LSTM}  strokeWidth={2} dot={false}/>
                    <Line type="monotone" dataKey="GRU"       name="GRU"       stroke={COLOR.GRU}   strokeWidth={2} dot={false}/>
                    <Line type="monotone" dataKey="ENSEMBLE"  name="Ensemble"  stroke={COLOR.ENSEMBLE} strokeWidth={2} dot={false}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            {/* ตาราง + Pagination */}
            <SectionTitle style={{ marginTop: 22 }}>Model Comparison</SectionTitle>
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
                  {pageRows.map((r) => {
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
                  {(!pageRows || pageRows.length === 0) && (
                    <tr><td colSpan="9" style={{ color: '#aaa', textAlign: 'center', padding: 18 }}>No data</td></tr>
                  )}
                </tbody>
              </Table>
            </TableWrap>

            <PaginationBar>
              <NavButton
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ก่อนหน้า
              </NavButton>

              <PageText>หน้า</PageText>
              <PageInput
                type="number"
                min={1}
                max={totalPages}
                value={pageDraft}
                onChange={(e) => setPageDraft(e.target.value)}
                onBlur={applyDraftPage}
                onKeyDown={(e) => (e.key === 'Enter') && applyDraftPage()}
              />
              <PageText>/ {totalPages} • รวม {totalRows} รายการ</PageText>

              <NavButton
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                ถัดไป
              </NavButton>
            </PaginationBar>
          </>
        ) : (
          !loading && <p style={{ color: '#a0a0a0' }}>No data</p>
        )}
      </Container>
    </MainContent>
  );
}
