// src/pages/Dashboard.js
import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { useNavigate } from 'react-router-dom';

/* ======================= CONFIG ======================= */
const API_BASE = 'http://localhost:3000/api';
const COUNTRY_TO_MARKET = { TH: 'Thailand', USA: 'America' };

const DEFAULT_COUNTRY = 'USA';
const DEFAULT_WINDOW = '1Y';
const MAX_SERIES = 1;

const WINDOWS = ['5D', '1M', '3M', '6M', '1Y', 'ALL'];
const COLORS = ['#ff8c00'];

/* ======================= UTILS ======================= */
const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d));
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
};

// เลือก delta ชุดที่ใช้ (YoY/QoQ) จาก summary + แถวล่าสุด
const chooseBaseDelta = (latestSummary, lastRow) => {
  if (!latestSummary || !lastRow) return { base: 'YoY', d: {} };
  const base = latestSummary.base || 'YoY';
  const d = base === 'YoY' ? (lastRow.yoy || {}) : (lastRow.qoq || {});
  return { base, d };
};

// แปลง ΔD/E จาก Δ×100 -> x (เช่น 7.00 -> 0.07x)
const fmtDeltaDE = (v) => (v == null ? '—' : `${(v / 100).toFixed(2)}x`);

// ===== คำนวณโดเมนแกน Y แบบไดนามิก (ไม่บังคับเริ่ม 0) =====
const computeYDomain = (rows, key) => {
  if (!rows?.length || !key) return ['dataMin', 'dataMax'];
  let min = Infinity, max = -Infinity;
  for (const r of rows) {
    const v = Number(r[key]);
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return ['dataMin', 'dataMax'];
  const range = max - min;
  const pad = Math.max(range * 0.06, 1); // เผื่อขอบ ~6% อย่างน้อย 1 หน่วย
  return [Math.floor(min - pad), Math.ceil(max + pad)];
};

// ===== สร้าง “เส้นแบ่งไตรมาส” ตามช่วงวันที่ในกราฟ =====
const pad2 = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const buildQuarterMarkers = (rows) => {
  if (!rows?.length) return [];
  const firstISO = rows[0].date;
  const lastISO  = rows[rows.length - 1].date;
  const first = new Date(firstISO);
  const last  = new Date(lastISO);

  const markers = [];
  for (let y = first.getFullYear(); y <= last.getFullYear(); y++) {
    for (const m of [0, 3, 6, 9]) {
      const qStart = new Date(y, m, 1);
      const qISO = dateStr(qStart);

      // หา "วันที่ที่มีจริงในชุดข้อมูล" ที่ >= วันแรกของไตรมาส
      const idx = rows.findIndex((r) => r.date >= qISO);
      if (idx === -1) continue;

      const x = rows[idx].date;
      // ถ้าเส้นอยู่นอกช่วงข้อมูล ก็ข้าม
      if (x < firstISO || x > lastISO) continue;

      const qLabel = ['Q1', 'Q2', 'Q3', 'Q4'][m / 3];
      markers.push({ x, label: qLabel });
    }
  }
  // กำจัดรายการซ้ำที่อาจเกิดจากหลายวันตรงกัน
  const uniq = [];
  const seen = new Set();
  for (const mk of markers) {
    if (!seen.has(mk.x)) { seen.add(mk.x); uniq.push(mk); }
  }
  return uniq;
};

function buildReasons(d) {
  const pos = [], neg = [];
  const push = (cond, arr, txt) => cond && arr.push(txt);

  if (d.eps != null) {
    push(d.eps >= 0, pos, `EPS เพิ่ม ${d.eps.toFixed(2)}% → กำไรต่อหุ้นดีขึ้น`);
    push(d.eps < 0,  neg, `EPS ลด ${d.eps.toFixed(2)}% → อาจมีกำไรหดหรือ dilution`);
  }
  if (d.revenue != null) {
    push(d.revenue >= 0, pos, `รายได้โต ${d.revenue.toFixed(2)}% → ความต้องการ/ราคาขายดีขึ้น`);
    push(d.revenue < 0,  neg, `รายได้หด ${d.revenue.toFixed(2)}% → อุปสงค์ชะลอหรือเสียส่วนแบ่ง`);
  }
  if (d.grossMarginPct != null) {
    const at = Math.abs(d.grossMarginPct).toFixed(2);
    push(d.grossMarginPct >= 0, pos, `Gross Margin เพิ่ม ${at}pp → ต้นทุน/มิกซ์ดีขึ้น`);
    push(d.grossMarginPct < 0,  neg, `Gross Margin ลด ${at}pp → ต้นทุนสูง/กดราคาแข่ง`);
  }
  if (d.netMarginPct != null) {
    const at = Math.abs(d.netMarginPct).toFixed(2);
    push(d.netMarginPct >= 0, pos, `Net Margin เพิ่ม ${at}pp → คุมค่าใช้จ่าย/ดอกเบี้ย/ภาษีดีขึ้น`);
    push(d.netMarginPct < 0,  neg, `Net Margin ลด ${at}pp → ค่าใช้จ่าย/ภาษี/ดอกเบี้ยสูงขึ้น`);
  }
  if (d.roePct != null) {
    const at = Math.abs(d.roePct).toFixed(2);
    push(d.roePct >= 0, pos, `ROE เพิ่ม ${at}pp → ใช้ทุนมีประสิทธิภาพขึ้น`);
    push(d.roePct < 0,  neg, `ROE ลด ${at}pp → ประสิทธิภาพต่อทุนลดลง`);
  }
  if (d.ocf != null) {
    push(d.ocf >= 0, pos, `Operating CF เพิ่ม ${d.ocf.toFixed(2)}% → คุณภาพกำไรแข็งแรง`);
    push(d.ocf < 0,  neg, `Operating CF ลด ${d.ocf.toFixed(2)}% → ระวังลูกหนี้/สต๊อก/เก็บเงินช้า`);
  }
  if (d.d2e != null) {
    const x = d.d2e / 100;
    push(x <= 0, pos, `D/E ลด ${Math.abs(x).toFixed(2)}x → ความเสี่ยงการเงินลดลง`);
    push(x >  0, neg, `D/E เพิ่ม ${x.toFixed(2)}x → leverage สูงขึ้น`);
  }

  // เรียงให้ตัวแรงขึ้นก่อน
  const byAbs = (t) => {
    const m = t.match(/([-+]?\d+(\.\d+)?)(%|pp|x)/);
    return m ? -Math.abs(parseFloat(m[1])) : 0;
  };
  pos.sort((a,b)=>byAbs(a)-byAbs(b));
  neg.sort((a,b)=>byAbs(a)-byAbs(b));

  return { pos, neg };
}

/* ======================= STYLED ======================= */
const Page = styled.div` padding:20px; display:flex; flex-direction:column; gap:20px; `;
const Title = styled.h2` color:#ff8c00; margin:0; font-size:28px; `;
const Card = styled.div` background:#1e1e1e; border:1px solid #333; border-radius:12px; padding:16px; `;
const HeaderRow = styled.div` display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; `;
const Left = styled.div` display:flex; gap:10px; align-items:center; flex-wrap:wrap; `;
const SubTitle = styled.h3` color:#ff8c00; margin:0; font-size:18px; `;
const Select = styled.select`
  padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.3);
  background:#333; color:#fff; font-weight:700;
`;
const Segments = styled.div`
  display:inline-flex; padding:4px; background:#2a2a2a; border:1px solid #444; border-radius:8px;
  > button { padding:6px 12px; border:0; border-radius:6px; color:#e0e0e0; background:transparent; font-weight:800; cursor:pointer; }
  > button.active { background:#ff8c00; color:#111; }
`;
const LegendWrap = styled.div` margin-top:8px; `;
const LegendItem = styled.div`
  display:inline-flex; align-items:center; gap:8px; font-weight:800; user-select:none;
  color:#ff8c00; cursor:pointer;
`;
const LegendDot = styled.span` display:inline-block; width:8px; height:8px; border-radius:50%; background:#ff8c00; `;

const Badge = styled.span`
  padding:4px 8px; border-radius:999px; font-weight:800;
  ${({ type }) => type === 'bull' ? 'background:#062; color:#8df;' :
                  type === 'bear' ? 'background:#320; color:#fba;' :
                  'background:#333; color:#ccc;'}
`;

const Grid = styled.div`
  display:grid; gap:10px;
  grid-template-columns: repeat(2, minmax(0,1fr));
  @media (max-width: 900px){ grid-template-columns: 1fr; }
`;
const Kpi = styled.div`
  background:#191919; border:1px solid #2a2a2a; border-radius:10px; padding:12px;
  > div.label { color:#99a; font-size:12px; }
  > div.val { font-size:18px; font-weight:800; }
  > div.delta { font-size:12px; color:#ccc; }
`;
const Bullet = styled.li` margin:6px 0; `;

/* ======================= COMPONENT ======================= */
export default function Dashboard() {
  const navigate = useNavigate();

  // controls
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [symbols, setSymbols] = useState([]);
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState(DEFAULT_WINDOW);

  // chart
  const [chartRows, setChartRows] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [errChart, setErrChart] = useState('');

  // fundamentals drivers
  const [drivers, setDrivers] = useState(null);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [errDrivers, setErrDrivers] = useState('');

  const market = COUNTRY_TO_MARKET[country];

  const goToTrend = (sym) => {
    if (!sym) return;
    const params = new URLSearchParams({ market, symbol: sym, timeframe });
    navigate(`/market-trend?${params.toString()}`);
  };

  /* ---------- โหลดรายการ symbol ตามประเทศ ---------- */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get(
          `${API_BASE}/market-trend/symbols?market=${encodeURIComponent(market)}`,
          getAuthHeaders()
        );
        const list = (data?.data || []).map(r => ({ symbol: r.StockSymbol, name: r.CompanyName || r.StockSymbol }));
        setSymbols(list);
        setSymbol(list[0]?.symbol || '');
      } catch {
        setSymbols([]); setSymbol('');
      }
    })();
  }, [country, market]);

  /* ---------- โหลดกราฟ (เฉพาะรายสัญลักษณ์) ---------- */
  useEffect(() => {
    if (!symbol) { setChartRows([]); return; }
    const controller = new AbortController();
    (async () => {
      try {
        setLoadingChart(true); setErrChart('');
        const url = `${API_BASE}/chart-data/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}`;
        const { data } = await axios.get(url, { ...getAuthHeaders(), signal: controller.signal });
        const rows = (data?.data || []).map(r => ({
          date: r.date,
          [symbol]: Number(r.ClosePrice)
        }));
        setChartRows(rows);
      } catch (e) {
        if (e.name !== 'CanceledError') setErrChart('โหลดข้อมูลกราฟไม่สำเร็จ');
        setChartRows([]);
      } finally {
        setLoadingChart(false);
      }
    })();
    return () => controller.abort();
  }, [symbol, timeframe, market]);

  /* ---------- โหลด Fundamental Drivers ---------- */
  useEffect(() => {
    if (!symbol) { setDrivers(null); return; }
    const controller = new AbortController();
    (async () => {
      try {
        setLoadingDrivers(true); setErrDrivers('');
        const url = `${API_BASE}/fundamentals/drivers?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(symbol)}&limitQuarters=8`;
        const { data } = await axios.get(url, { ...getAuthHeaders(), signal: controller.signal });
        setDrivers(data);
      } catch (e) {
        if (e.name !== 'CanceledError') setErrDrivers('วิเคราะห์งบไม่สำเร็จ');
        setDrivers(null);
      } finally {
        setLoadingDrivers(false);
      }
    })();
    return () => controller.abort();
  }, [symbol, market]);

  /* ---------- สร้างเส้นราคา ---------- */
  const lines = useMemo(() => {
    if (!chartRows.length || !symbol) return [];
    return [symbol];
  }, [chartRows, symbol]);

  // ===== คำนวณ yDomain & เส้นแบ่งไตรมาส =====
  const yDomain = useMemo(() => computeYDomain(chartRows, symbol), [chartRows, symbol]);
  const quarterMarkers = useMemo(() => buildQuarterMarkers(chartRows), [chartRows]);

  /* ---------- เตรียมข้อมูลสรุป/เหตุผล ---------- */
  const latest = drivers?.summary || null;
  const lastRow = drivers?.data?.[drivers?.data?.length - 1] || null;
  const latestMetrics = lastRow?.metrics || {};
  const yoy = lastRow?.yoy || {};
  const qoq = lastRow?.qoq || {};
  const badgeType = latest ? (latest.score >= 0 ? 'bull' : 'bear') : 'neutral';

  const { base: usedBase, d: usedDelta } = useMemo(
    () => chooseBaseDelta(latest, lastRow),
    [latest, lastRow]
  );
  const human = useMemo(
    () => buildReasons(usedDelta),
    [usedDelta]
  );

  return (
    <Page>
      <Title>Dashboard — Fundamentals (Per Stock)</Title>

      {/* Controls */}
      <Card>
        <HeaderRow>
          <Left>
            <SubTitle>Price — {market}</SubTitle>

            <Select value={country} onChange={e => setCountry(e.target.value)}>
              <option value="TH">Thailand (TH)</option>
              <option value="USA">United States (USA)</option>
            </Select>

            {/* เลือกหุ้น */}
            <Select value={symbol} onChange={e => setSymbol(e.target.value)}>
              {symbols.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
            </Select>
          </Left>

          <Segments>
            {WINDOWS.map(tf => (
              <button key={tf} className={tf === timeframe ? 'active' : ''} onClick={() => setTimeframe(tf)}>{tf}</button>
            ))}
          </Segments>
        </HeaderRow>

        {errChart && <div style={{ color: '#ef4444', marginTop: 6 }}>{errChart}</div>}
        {loadingChart && <div style={{ color: '#a0a0a0', marginTop: 6 }}>Loading chart...</div>}

        {/* กราฟราคาอย่างเดียว */}
        <div style={{ height: 420, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 18, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: '#c9c9c9' }} tickFormatter={fmtDate} />
              <YAxis
                tick={{ fill: '#c9c9c9' }}
                domain={yDomain}     // แกน Y แบบไดนามิก
                allowDecimals
                minTickGap={8}
              />
              <Tooltip
                formatter={(value, name) => [fmt(value), name]}
                labelFormatter={(l) => `Date: ${fmtDate(l)}`}
                contentStyle={{ background: '#2a2a2a', border: '1px solid #444', color: '#eee' }}
                wrapperStyle={{ zIndex: 20 }}
              />

              {/* เส้นแบ่งไตรมาส */}
              {quarterMarkers.map((mk, i) => (
                <ReferenceLine
                  key={`qline-${mk.x}-${i}`}
                  x={mk.x}
                  stroke="#555"
                  strokeDasharray="4 2"
                  ifOverflow="extendDomain"
                  label={{ value: mk.label, position: 'top', fill: '#9aa', fontSize: 10 }}
                />
              ))}

              {lines.map((k, idx) => (
                <Line
                  key={`price-${k}`}
                  type="monotone"
                  dataKey={k}
                  name={k}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                  onClick={() => goToTrend(k)}
                  style={{ cursor: 'pointer', pointerEvents: 'visibleStroke' }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        {symbol && (
          <LegendWrap>
            <LegendItem title={symbol} onClick={() => goToTrend(symbol)}>
              <LegendDot />
              <span>{symbol}</span>
            </LegendItem>
          </LegendWrap>
        )}
      </Card>

      {/* ======= การ์ดสรุป “ทำไมขึ้น/ลง” จากงบ ======= */}
      <Card>
        <SubTitle>Why Up / Down — จากงบการเงิน ({symbol})</SubTitle>
        {errDrivers && <div style={{ color: '#ef4444', marginTop: 6 }}>{errDrivers}</div>}
        {loadingDrivers && <div style={{ color: '#a0a0a0', marginTop: 6 }}>Analyzing fundamentals…</div>}

        {!loadingDrivers && drivers && (
          <>
            <div style={{ marginTop: 8, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
              <Badge type={badgeType}>
                {latest?.score >= 0 ? 'Bullish pressure' : 'Bearish pressure'} ({usedBase})
              </Badge>
              <div style={{ color:'#9aa' }}>
                Latest: <b>{latest?.latestQuarter || '—'}</b> {latest?.reportDate ? ` • reported ${fmtDate(latest.reportDate)}` : ''}
              </div>
            </div>

            <Grid style={{ marginTop: 12 }}>
              <Card>
                <SubTitle>เหตุผลหนุน</SubTitle>
                <ul style={{ marginTop: 8 }}>
                  {human.pos.length ? human.pos.map((t, i) => <Bullet key={`p${i}`}>✓ {t}</Bullet>) : <div style={{ color:'#aaa' }}>—</div>}
                </ul>
              </Card>

              <Card>
                <SubTitle>เหตุผลกดดัน</SubTitle>
                <ul style={{ marginTop: 8 }}>
                  {human.neg.length ? human.neg.map((t, i) => <Bullet key={`n${i}`}>• {t}</Bullet>) : <div style={{ color:'#aaa' }}>—</div>}
                </ul>
              </Card>
            </Grid>

            {/* KPIs ล่าสุด + YoY/QoQ */}
            <Grid style={{ marginTop: 12 }}>
              <Kpi>
                <div className="label">Revenue</div>
                <div className="val">{fmt(latestMetrics.revenue, 0)}</div>
                <div className="delta">YoY {fmt(yoy?.revenue)}% • QoQ {fmt(qoq?.revenue)}%</div>
              </Kpi>
              <Kpi>
                <div className="label">EPS</div>
                <div className="val">{fmt(latestMetrics.eps, 2)}</div>
                <div className="delta">YoY {fmt(yoy?.eps)}% • QoQ {fmt(qoq?.eps)}%</div>
              </Kpi>
              <Kpi>
                <div className="label">Gross Margin</div>
                <div className="val">{fmt(latestMetrics.grossMarginPct, 2)}%</div>
                <div className="delta">ΔYoY {fmt(yoy?.grossMarginPct,2)} pp • ΔQoQ {fmt(qoq?.grossMarginPct,2)} pp</div>
              </Kpi>
              <Kpi>
                <div className="label">Net Profit Margin</div>
                <div className="val">{fmt(latestMetrics.netMarginPct, 2)}%</div>
                <div className="delta">ΔYoY {fmt(yoy?.netMarginPct,2)} pp • ΔQoQ {fmt(qoq?.netMarginPct,2)} pp</div>
              </Kpi>
              <Kpi>
                <div className="label">ROE</div>
                <div className="val">{fmt(latestMetrics.roePct, 2)}%</div>
                <div className="delta">ΔYoY {fmt(yoy?.roePct,2)} pp • ΔQoQ {fmt(qoq?.roePct,2)} pp</div>
              </Kpi>
              <Kpi>
                <div className="label">Debt / Equity</div>
                <div className="val">{fmt(latestMetrics.d2e, 2)}x</div>
                <div className="delta">
                  ΔYoY {yoy?.d2e==null ? '—' : fmtDeltaDE(yoy.d2e)} • ΔQoQ {qoq?.d2e==null ? '—' : fmtDeltaDE(qoq.d2e)}
                </div>
              </Kpi>
              <Kpi>
                <div className="label">Operating CF</div>
                <div className="val">{fmt(latestMetrics.ocf, 0)}</div>
                <div className="delta">YoY {fmt(yoy?.ocf)}% • QoQ {fmt(qoq?.ocf)}%</div>
              </Kpi>
            </Grid>
          </>
        )}
      </Card>
    </Page>
  );
}
