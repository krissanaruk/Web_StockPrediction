// src/pages/Dashboard.js
import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { useNavigate } from 'react-router-dom';

/* ======================= CONFIG ======================= */
const API_BASE = 'http://localhost:3000/api';
const COUNTRY_TO_MARKET = { TH: 'Thailand', USA: 'America' };

// เปิดมาที่ USA + 1Y + โหมดกลุ่มแบบ Industry เท่านั้น (ตัด Sector ออกทั้งหมด)
const DEFAULT_COUNTRY = 'USA';
const DEFAULT_WINDOW = '1Y';
const GROUP_BY_MODE = 'industry'; // 🔒 ใช้ industry อย่างเดียว

const MAX_SERIES = 10;
const WINDOWS = ['5D', '1M', '3M', '6M', '1Y', 'ALL'];

const COLORS = [
  '#ff8c00', '#0dcaf0', '#20c997', '#a78bfa', '#ef4444', '#22c55e',
  '#f59e0b', '#3b82f6', '#eab308', '#10b981', '#f97316', '#8b5cf6'
];

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

/* ===== helpers ===== */
const combineByDateIndexValue = (seriesMap) => {
  // สำหรับโหมด "กลุ่ม": arr item = {date, value}
  const index = new Map();
  Object.entries(seriesMap).forEach(([key, arr]) => {
    arr.forEach(({ date, value }) => {
      if (!index.has(date)) index.set(date, { date });
      index.get(date)[key] = value;
    });
  });
  return Array.from(index.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
};

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
const TwoCol = styled.div`
  display:grid; grid-template-columns: 1fr 1fr; gap:16px;
  @media (max-width: 1100px){ grid-template-columns: 1fr; }
`;
const ListCard = styled(Card)` max-height:420px; overflow:auto; `;
const Row = styled.div`
  display:flex; justify-content:space-between; padding:10px 6px; border-bottom:1px solid #2a2a2a;
  cursor: pointer; &:hover { background:#252525; }
`;
const Sym = styled.span` font-weight:800; `;
const Pct = styled.span` font-weight:800; `;
const LegendWrap = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px 14px; padding-top: 8px;
`;
const LegendItem = styled.div`
  display: inline-flex; align-items: center; gap: 8px;
  font-weight: 800; user-select: none; outline: none;
  ${({ clickable }) => clickable ? 'cursor:pointer;&:hover{opacity:.9;text-decoration:underline;}' : 'opacity:.95;'}
`;
const LegendDot = styled.span` display:inline-block; width:8px; height:8px; border-radius:50%; background: ${p => p.color || '#999'}; `;
const LegendLabel = styled.span` max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; `;
const Hint = styled.div` color:#9aa; font-size:12px; margin-top:6px; `;

/* ======================= COMPONENT ======================= */
export default function Dashboard() {
  const navigate = useNavigate();

  // controls
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [symbols, setSymbols] = useState([]);
  const [symbol, setSymbol] = useState('ALL');      // 'ALL' = โหมดกลุ่ม
  const [timeframe, setTimeframe] = useState(DEFAULT_WINDOW);

  // โหมดกลุ่ม (ALL)
  const [groups, setGroups] = useState([]);         // [{key,label,count}]

  // chart
  const [chartRows, setChartRows] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [errChart, setErrChart] = useState('');

  // movers
  const [gainers, setGainers] = useState([]);
  const [losers, setLosers] = useState([]);
  const [loadingMovers, setLoadingMovers] = useState(false);
  const [errMovers, setErrMovers] = useState('');

  const market = COUNTRY_TO_MARKET[country];
  const isAll = symbol === 'ALL';

  const goToTrend = (sym) => {
    if (!sym || isAll) return;
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
        setSymbol(list.length > 1 ? 'ALL' : (list[0]?.symbol || ''));
      } catch {
        setSymbols([]); setSymbol('ALL');
      }
    })();
  }, [country, market]);

  /* ---------- โหลดรายชื่อกลุ่ม (Industry-only) เมื่อโหมด ALL ---------- */
  useEffect(() => {
    if (!isAll) { setGroups([]); return; }
    (async () => {
      try {
        const { data } = await axios.get(
          `${API_BASE}/meta/groups?market=${encodeURIComponent(market)}&groupBy=${encodeURIComponent(GROUP_BY_MODE)}`,
          getAuthHeaders()
        );
        const rows = data?.data || [];
        setGroups(rows.slice(0, MAX_SERIES)); // เอาท็อป MAX_SERIES
      } catch {
        setGroups([]);
      }
    })();
  }, [isAll, market]);

  /* ---------- โหลดกราฟ ---------- */
  useEffect(() => {
    if (!symbol) { setChartRows([]); return; }
    const controller = new AbortController();
    (async () => {
      try {
        setLoadingChart(true); setErrChart('');

        // 1) โหมดหุ้นรายตัว
        if (!isAll) {
          const url = `${API_BASE}/chart-data/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}`;
          const { data } = await axios.get(url, { ...getAuthHeaders(), signal: controller.signal });
          const rows = (data?.data || []).map(r => ({
            date: r.date,
            [symbol]: Number(r.ClosePrice)
          }));
          setChartRows(rows);
          return;
        }

        // 2) โหมดกลุ่ม (ALL) -> group composite แบบ Equal-Weight (Indexed = 100)
        if (!groups.length) { setChartRows([]); return; }

        const fetchGroup = async (gkey) => {
          const url = `${API_BASE}/benchmarks/group-composite?market=${encodeURIComponent(market)}&groupBy=${encodeURIComponent(GROUP_BY_MODE)}&key=${encodeURIComponent(gkey)}&timeframe=${encodeURIComponent(timeframe)}&method=equal`;
          const { data } = await axios.get(url, { ...getAuthHeaders(), signal: controller.signal });
          return (data?.data || []).map(x => ({ date: x.date, value: Number(x.index) })); // index = normalized 100
        };

        const pick = groups.slice(0, MAX_SERIES).map(g => g.key);
        const settled = await Promise.allSettled(pick.map(k => fetchGroup(k)));

        const seriesMap = {};
        settled.forEach((r, i) => {
          const key = pick[i];
          if (r.status === 'fulfilled' && r.value.length) seriesMap[key] = r.value;
        });

        const merged = combineByDateIndexValue(seriesMap);
        setChartRows(merged);
      } catch (e) {
        if (e.name !== 'CanceledError') setErrChart('โหลดข้อมูลกราฟไม่สำเร็จ');
        setChartRows([]);
      } finally {
        setLoadingChart(false);
      }
    })();
    return () => controller.abort();
  }, [symbol, timeframe, isAll, market, groups]);

  /* ---------- โหลด Gainers/Losers ---------- */
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setLoadingMovers(true); setErrMovers('');
        const url = `${API_BASE}/market-movers/range?market=${encodeURIComponent(market)}&timeframe=${encodeURIComponent(timeframe)}&limitSymbols=5000`;
        const { data } = await axios.get(url, { ...getAuthHeaders(), signal: controller.signal });
        const rows = data?.data || [];
        const g = rows.filter(r => (r.changePct ?? 0) > 0).sort((a, b) => b.changePct - a.changePct);
        const l = rows.filter(r => (r.changePct ?? 0) < 0).sort((a, b) => a.changePct - b.changePct);
        setGainers(g); setLosers(l);
      } catch (e) {
        if (e.name !== 'CanceledError') setErrMovers('โหลด gainers/losers ไม่สำเร็จ');
        setGainers([]); setLosers([]);
      } finally {
        setLoadingMovers(false);
      }
    })();
    return () => controller.abort();
  }, [market, timeframe]);

  /* สร้างรายชื่อเส้นจากทุกแถว */
  const lines = useMemo(() => {
    if (!chartRows.length) return [];
    const set = new Set();
    for (const row of chartRows) {
      for (const k of Object.keys(row)) {
        if (k !== 'date') set.add(k);
      }
    }
    return Array.from(set).slice(0, MAX_SERIES);
  }, [chartRows]);

  return (
    <Page>
      <Title>Dashboard Overview</Title>

      <Card>
        <HeaderRow>
          <Left>
            <SubTitle>
              {isAll ? `Price — ${market} (Indexed = 100)` : `Price — ${market}`}
            </SubTitle>

            <Select value={country} onChange={e => setCountry(e.target.value)}>
              <option value="TH">Thailand (TH)</option>
              <option value="USA">United States (USA)</option>
            </Select>

            {/* เลือกหุ้น/โหมด ALL */}
            <Select value={symbol} onChange={e => setSymbol(e.target.value)}>
              {symbols.length > 1 && <option value="ALL">ALL (Group)</option>}
              {symbols.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
            </Select>
            {/* ✅ ไม่มีป้าย/ปุ่ม Industry แล้ว */}
          </Left>

          <Segments>
            {WINDOWS.map(tf => (
              <button key={tf} className={tf === timeframe ? 'active' : ''} onClick={() => setTimeframe(tf)}>{tf}</button>
            ))}
          </Segments>
        </HeaderRow>

       
        {errChart && <div style={{ color: '#ef4444', marginTop: 6 }}>{errChart}</div>}
        {loadingChart && <div style={{ color: '#a0a0a0', marginTop: 6 }}>Loading chart...</div>}

        <div style={{ height: 420, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: '#c9c9c9' }} tickFormatter={fmtDate} />
              <YAxis tick={{ fill: '#c9c9c9' }} />
              <Tooltip
                formatter={(value, name) => [fmt(value), name]}
                labelFormatter={(l) => `Date: ${fmtDate(l)}`}
                contentStyle={{ background: '#2a2a2a', border: '1px solid #444', color: '#eee' }}
                wrapperStyle={{ zIndex: 20 }}
              />

              {/* เส้นจริง — คลิกเส้นเพื่อไปหน้า Market Trend (เฉพาะโหมดหุ้นรายตัว) */}
              {lines.map((k, idx) => (
                <Line
                  key={`vis-${k}`}
                  type="monotone"
                  dataKey={k}
                  name={k}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                  onClick={() => { if (!isAll) goToTrend(k); }}
                  style={{
                    cursor: !isAll ? 'pointer' : 'default',
                    // ให้คลิกถูกเส้นได้จริงบน path
                    pointerEvents: !isAll ? 'visibleStroke' : 'none'
                  }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend แบบกริดอยู่นอกกราฟ (คลิกได้เฉพาะโหมดหุ้นรายตัว) */}
        <div style={{ marginTop: 8 }}>
          <LegendWrap>
            {lines.map((name, i) => (
              <LegendItem
                key={name}
                clickable={!isAll}
                onClick={!isAll ? () => goToTrend(name) : undefined}
                title={name}
                style={{ color: COLORS[i % COLORS.length] }}
              >
                <LegendDot color={COLORS[i % COLORS.length]} />
                <LegendLabel>{name}</LegendLabel>
              </LegendItem>
            ))}
          </LegendWrap>
        </div>
      </Card>

      <TwoCol>
        <ListCard>
          <SubTitle>Gainers — {market} ({timeframe})</SubTitle>
          {errMovers && <div style={{ color: '#ef4444', marginTop: 6 }}>{errMovers}</div>}
          {loadingMovers && <div style={{ color: '#a0a0a0', marginTop: 6 }}>Loading...</div>}
          {!loadingMovers && !gainers.length && <div style={{ color: '#aaa', marginTop: 8 }}>No data</div>}
          {gainers.map(r => (
            <Row key={`G-${r.StockSymbol}`} onClick={() => goToTrend(r.StockSymbol)} title="Open in Market Trend">
              <Sym>{r.StockSymbol}</Sym>
              <Pct style={{ color: '#22c55e' }}>{fmt(r.changePct, 2)}%</Pct>
            </Row>
          ))}
        </ListCard>

        <ListCard>
          <SubTitle>Losers — {market} ({timeframe})</SubTitle>
          {errMovers && <div style={{ color: '#ef4444', marginTop: 6 }}>{errMovers}</div>}
          {loadingMovers && <div style={{ color: '#a0a0a0', marginTop: 6 }}>Loading...</div>}
          {!loadingMovers && !losers.length && <div style={{ color: '#aaa', marginTop: 8 }}>No data</div>}
          {losers.map(r => (
            <Row key={`L-${r.StockSymbol}`} onClick={() => goToTrend(r.StockSymbol)} title="Open in Market Trend">
              <Sym>{r.StockSymbol}</Sym>
              <Pct style={{ color: '#ef4444' }}>{fmt(r.changePct, 2)}%</Pct>
            </Row>
          ))}
        </ListCard>
      </TwoCol>
    </Page>
  );
}
