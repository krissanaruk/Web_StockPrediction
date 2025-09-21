// OverviewDashboard.js
import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush, BarChart, Bar
} from 'recharts';

/* ============================== CONFIG ============================== */
const API_BASE = 'http://localhost:3000/api';
const COUNTRY_TO_MARKET = { TH: 'Thailand', USA: 'America' };
const DEFAULT_COUNTRY = 'TH';
const DEFAULT_WINDOW = '1M';

const WINDOWS = [
  { key: '5D', label: '5D', limit: 6 },
  { key: '1M', label: '1M', limit: 22 },
  { key: '3M', label: '3M', limit: 66 },
  { key: '6M', label: '6M', limit: 132 },
  { key: '1Y', label: '1Y', limit: 264 },
  { key: 'ALL', label: 'ALL', limit: 520 },
];

const ALL_MODE_MAX_SYMBOLS = 12;
const COLOR_PALETTE = [
  '#ff8c00', '#0dcaf0', '#20c997', '#a78bfa', '#ef4444', '#22c55e',
  '#f59e0b', '#3b82f6', '#eab308', '#10b981', '#f97316', '#8b5cf6'
];

const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

/* ============================== UTILS ============================== */
const fmtNum = (v, d = 2) => (v == null || isNaN(v) ? '—' : Number(v).toFixed(d));
const combineByDate = (seriesMap) => {
  const index = new Map();
  Object.entries(seriesMap).forEach(([sym, arr]) => {
    arr.forEach(({ date, close }) => {
      if (!index.has(date)) index.set(date, { date });
      index.get(date)[sym] = close;
    });
  });
  return Array.from(index.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
};

/* ============================== STYLED ============================== */
const Page = styled.div`flex:1; display:flex; flex-direction:column; gap:16px; padding:20px; color:#e0e0e0;`;
const Title = styled.h1`margin:0; color:#ff8c00; font-size:28px;`;
const Card = styled.div`background:#1f1f1f; border:1px solid #2f2f2f; border-radius:12px; padding:16px;`;
const HeaderRow = styled.div`display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;`;
const Left = styled.div`display:flex; gap:12px; align-items:center; flex-wrap:wrap;`;
const Select = styled.select`
  padding:8px 10px; border-radius:8px; background:#2a2a2a; color:#eee; border:1px solid #3a3a3a; font-weight:600;
`;
const Segments = styled.div`
  display:inline-flex; padding:4px; background:#2a2a2a; border:1px solid #3a3a3a; border-radius:10px;
  > button{ border:0; background:transparent; color:#bbb; padding:6px 10px; border-radius:8px; font-weight:700; cursor:pointer; }
  > button.active{ background:#ff8c00; color:#111; }
`;
const SubTitle = styled.h3`color:#ff8c00; margin:0; font-size:20px;`;
const TwoCol = styled.div`display:grid; grid-template-columns: 1fr 1fr; gap:16px; @media(max-width:1100px){grid-template-columns:1fr;}`;
const ListCard = styled.div`background:#1f1f1f; border:1px solid #2f2f2f; border-radius:12px; padding:12px; max-height:380px; overflow:auto;`;
const Item = styled.div`display:flex; justify-content:space-between; padding:10px 6px; border-bottom:1px solid #2c2c2c;`;
const Sym = styled.span`font-weight:800;`;
const Pct = styled.span`font-weight:800;`;

/* ============================== COMPONENT ============================== */
export default function OverviewDashboard() {
  // คอนโทรลชุดเดียว
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [symbols, setSymbols] = useState([]); // [{symbol,name}]
  const [symbol, setSymbol] = useState('ALL'); // เริ่ม ALL ถ้ามีหลายตัว
  const [windowKey, setWindowKey] = useState(DEFAULT_WINDOW);

  // ราคา
  const [priceRows, setPriceRows] = useState([]);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [errPrice, setErrPrice] = useState('');

  // Gainers / Losers ตามช่วง
  const [gainers, setGainers] = useState([]);
  const [losers, setLosers] = useState([]);
  const [loadingMovers, setLoadingMovers] = useState(false);
  const [errMovers, setErrMovers] = useState('');

  const isAll = symbol === 'ALL';
  const windowCfg = WINDOWS.find(w => w.key === windowKey) || WINDOWS[1];

  // โหลดสัญลักษณ์
  useEffect(() => {
    (async () => {
      try {
        const market = COUNTRY_TO_MARKET[country];
        const { data } = await axios.get(
          `${API_BASE}/market-trend/symbols?market=${encodeURIComponent(market)}`,
          getAuthHeaders()
        );
        const list = (data?.data || []).map(r => ({ symbol: r.StockSymbol, name: r.CompanyName || r.StockSymbol }));
        setSymbols(list);
        setSymbol(list.length > 1 ? 'ALL' : (list[0]?.symbol || ''));
      } catch (e) {
        console.error(e);
        setSymbols([]); setSymbol('');
      }
    })();
  }, [country]);

  // โหลดกราฟราคา
  useEffect(() => {
    if (!symbol) { setPriceRows([]); return; }
    const controller = new AbortController();
    (async () => {
      try {
        setLoadingPrice(true); setErrPrice('');
        const limit = windowCfg.limit;
        const fetchOne = async (sym) => {
          const url = `${API_BASE}/market-trend/data?symbol=${encodeURIComponent(sym)}&limit=${limit}`;
          const { data } = await axios.get(url, { ...getAuthHeaders(), signal: controller.signal });
          return (data?.series || []).map(r => ({ date: r.date, close: Number(r.ClosePrice) }));
        };

        if (isAll) {
          const pick = symbols.slice(0, ALL_MODE_MAX_SYMBOLS).map(s => s.symbol);
          const results = await Promise.allSettled(pick.map(sym => fetchOne(sym)));
          const seriesMap = {};
          results.forEach((res, idx) => { const sym = pick[idx]; if (res.status === 'fulfilled') seriesMap[sym] = res.value; });
          setPriceRows(combineByDate(seriesMap));
        } else {
          const arr = await fetchOne(symbol);
          setPriceRows(arr.map(x => ({ date: x.date, [symbol]: x.close })));
        }
      } catch (e) {
        if (e.name !== 'CanceledError') setErrPrice(e?.response?.data?.error || 'โหลดข้อมูลราคาไม่สำเร็จ');
        setPriceRows([]);
      } finally {
        setLoadingPrice(false);
      }
    })();
    return () => controller.abort();
  }, [symbol, windowKey, symbols]);

  // โหลด Gainers/Losers ตามช่วงเวลา (แสดงทั้งหมด)
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setLoadingMovers(true); setErrMovers('');
        const market = COUNTRY_TO_MARKET[country];
        const url = `${API_BASE}/market-movers/range?market=${encodeURIComponent(market)}&timeframe=${encodeURIComponent(windowKey)}&limitSymbols=5000`;
        const { data } = await axios.get(url, { ...getAuthHeaders(), signal: controller.signal });
        const rows = data?.data || [];
        const g = rows.filter(r => (r.changePct ?? 0) > 0).sort((a,b)=> b.changePct - a.changePct);
        const l = rows.filter(r => (r.changePct ?? 0) < 0).sort((a,b)=> a.changePct - b.changePct);
        setGainers(g); setLosers(l);
      } catch (e) {
        if (e.name !== 'CanceledError') setErrMovers(e?.response?.data?.error || 'โหลด gainers/losers ไม่สำเร็จ');
        setGainers([]); setLosers([]);
      } finally {
        setLoadingMovers(false);
      }
    })();
    return () => controller.abort();
  }, [country, windowKey]);

  const priceLines = useMemo(() => {
    if (!priceRows.length) return [];
    return Object.keys(priceRows[0]).filter(k => k !== 'date').slice(0, ALL_MODE_MAX_SYMBOLS);
  }, [priceRows]);

  return (
    <Page>
      <Title>Dashboard Overview</Title>

      {/* === การ์ดกราฟ + คอนโทรลชุดเดียว === */}
      <Card>
        <HeaderRow>
          <Left>
            <SubTitle>Price — {COUNTRY_TO_MARKET[country] || '—'}</SubTitle>
            <Select value={country} onChange={e => setCountry(e.target.value)}>
              <option value="TH">Thailand (TH)</option>
              <option value="USA">United States (USA)</option>
            </Select>
            <Select value={symbol} onChange={e => setSymbol(e.target.value)}>
              {symbols.length > 1 && <option value="ALL">ALL</option>}
              {symbols.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
            </Select>
          </Left>
          <Segments>
            {WINDOWS.map(w => (
              <button
                key={w.key}
                className={w.key === windowKey ? 'active' : ''}
                onClick={() => setWindowKey(w.key)}
              >
                {w.label}
              </button>
            ))}
          </Segments>
        </HeaderRow>

        {errPrice && <div style={{ color:'#ef4444', marginTop:6 }}>{errPrice}</div>}
        {loadingPrice && <div style={{ color:'#a0a0a0', marginTop:6 }}>Loading price...</div>}

        <div style={{ height: 420, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={priceRows} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: '#c9c9c9' }} />
              <YAxis tick={{ fill: '#c9c9c9' }} tickFormatter={(v)=>fmtNum(v)} />
              <Tooltip
                formatter={(value, name) => [fmtNum(value), name]}
                labelFormatter={(l) => `Date: ${l}`}
                contentStyle={{ background:'#2a2a2a', border:'1px solid #444', color:'#eee' }}
              />
              <Legend />
              {priceLines.map((k, idx) => (
                <Line key={k} type="monotone" dataKey={k} name={k}
                  stroke={COLOR_PALETTE[idx % COLOR_PALETTE.length]} strokeWidth={2} dot={false} isAnimationActive={false}/>
              ))}
              <Brush dataKey="date" height={26} travellerWidth={12} stroke="#666"
                startIndex={0} endIndex={Math.min(Math.max(priceRows.length-1,0), 40)} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* === Gainers / Losers ตามช่วงเวลา (ทั้งหมด) === */}
      <TwoCol>
        <ListCard>
          <HeaderRow><SubTitle>Gainers — {COUNTRY_TO_MARKET[country]} ({WINDOWS.find(w=>w.key===windowKey)?.label})</SubTitle></HeaderRow>
          {errMovers && <div style={{color:'#ef4444'}}> {errMovers} </div>}
          {loadingMovers && <div style={{color:'#a0a0a0'}}>Loading...</div>}
          {!loadingMovers && !gainers.length && <div style={{color:'#aaa'}}>No data</div>}
          {gainers.map(row => (
            <Item key={`G-${row.StockSymbol}`}>
              <Sym>{row.StockSymbol}</Sym>
              <Pct style={{ color:'#22c55e' }}>{fmtNum(row.changePct,2)}%</Pct>
            </Item>
          ))}
        </ListCard>

        <ListCard>
          <HeaderRow><SubTitle>Losers — {COUNTRY_TO_MARKET[country]} ({WINDOWS.find(w=>w.key===windowKey)?.label})</SubTitle></HeaderRow>
          {errMovers && <div style={{color:'#ef4444'}}> {errMovers} </div>}
          {loadingMovers && <div style={{color:'#a0a0a0'}}>Loading...</div>}
          {!loadingMovers && !losers.length && <div style={{color:'#aaa'}}>No data</div>}
          {losers.map(row => (
            <Item key={`L-${row.StockSymbol}`}>
              <Sym>{row.StockSymbol}</Sym>
              <Pct style={{ color:'#ef4444' }}>{fmtNum(row.changePct,2)}%</Pct>
            </Item>
          ))}
        </ListCard>
      </TwoCol>

      {/* (ถ้าต้องการกราฟแท่งสรุป performance ทั้งตลาด ใส่ BarChart เพิ่มใต้ลิสต์นี้ได้) */}
    </Page>
  );
}
