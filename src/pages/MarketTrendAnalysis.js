// src/pages/MarketTrendAnalysis.js
import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import { useLocation } from 'react-router-dom';

/* =========================================================================
   1) CONFIG
   ========================================================================= */
const API_BASE = 'http://localhost:3000/api/market-trend';

const COUNTRY_TO_MARKET = { TH: 'Thailand', USA: 'America' };
const MARKET_TO_COUNTRY = { Thailand: 'TH', America: 'USA' };
const DEFAULT_SYMBOL_BY_COUNTRY = { TH: 'ADVANC', USA: 'AAPL' };

/** Timeframe -> จำนวนแท่งที่จะใช้ในหน้าต่างคำนวณ/แสดงผล */
const TF_LIMIT = {
  '1D': 2,
  '5D': 7,
  '1M': 22,
  '3M': 66,
  '6M': 132,
  '1Y': 252,
  'ALL': 320,
};
const DEFAULT_TF = '1M';

/** โหลดขั้นต่ำให้ MA200/MACD/BB/RSI และ warmup พร้อมแน่ ๆ */
const LOOKBACKS = [200, 26 + 9, 20, 14]; // MA200, MACD(12,26,9), BB20, RSI14
const WARMUP = 30;
const LOOKAHEAD = 5;
const INDICATOR_MIN = Math.max(...LOOKBACKS) + WARMUP + LOOKAHEAD; // ~260

/** UI เงินตามตลาด */
const CURRENCY_BY_MARKET = { Thailand: 'THB', America: 'USD' };
const fmtMoney = (value, market) => {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A';
  const currency = CURRENCY_BY_MARKET[market] || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency === 'THB' ? '฿' : '$'}${Number(value).toFixed(2)}`;
  }
};
const auth = () => {
  const token = localStorage.getItem('adminToken');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

/* =========================================================================
   2) HELPERS
   ========================================================================= */
const toNum = (v) => (v == null ? null : Number(v));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

const stdev = (arr) => {
  const v = arr.filter((x) => Number.isFinite(x));
  if (!v.length) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
};
const maxDrawdown = (prices) => {
  let peak = -Infinity, mdd = 0;
  for (const p of prices) {
    if (!Number.isFinite(p)) continue;
    peak = Math.max(peak, p);
    mdd = Math.min(mdd, (p - peak) / peak);
  }
  return mdd; // negative number
};

/* =========================================================================
   3) INDICATORS (null-safe)
   ========================================================================= */
const sma = (arr, period) => {
  if (!arr?.length) return [];
  const out = new Array(arr.length).fill(null);
  let sum = 0, q = [];
  for (let i = 0; i < arr.length; i++) {
    const v = Number.isFinite(arr[i]) ? arr[i] : null;
    if (v == null) { q = []; sum = 0; continue; }
    q.push(v); sum += v;
    if (q.length > period) sum -= q.shift();
    if (q.length === period) out[i] = sum / period;
  }
  return out;
};
const ema = (arr, period) => {
  if (!arr?.length) return [];
  const out = new Array(arr.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < arr.length; i++) {
    const v = Number.isFinite(arr[i]) ? arr[i] : null;
    if (v == null) { out[i] = prev; continue; }
    if (prev == null) prev = v;
    else prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
};
const rsi = (arr, period = 14) => {
  if (!arr?.length || arr.length < period + 1) return new Array(arr?.length || 0).fill(null);
  const out = new Array(arr.length).fill(null);
  const gain = [], loss = [];
  for (let i = 1; i < arr.length; i++) {
    const a = Number.isFinite(arr[i]) ? arr[i] : null;
    const b = Number.isFinite(arr[i - 1]) ? arr[i - 1] : null;
    if (a == null || b == null) { gain.push(0); loss.push(0); continue; }
    const d = a - b;
    gain.push(Math.max(d, 0)); loss.push(Math.max(-d, 0));
  }
  let G = gain.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let L = loss.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period] = L === 0 ? 100 : 100 - 100 / (1 + G / L);
  for (let i = period + 1; i < arr.length; i++) {
    G = (G * (period - 1) + (gain[i - 1] ?? 0)) / period;
    L = (L * (period - 1) + (loss[i - 1] ?? 0)) / period;
    out[i] = L === 0 ? 100 : 100 - 100 / (1 + G / L);
  }
  return out;
};
const macd = (arr, fast = 12, slow = 26, signalP = 9) => {
  if (!arr?.length) return { macdLine: [], signalLine: [], hist: [] };
  const ef = ema(arr, fast), es = ema(arr, slow);
  const macdLine = arr.map((_, i) => (ef[i] != null && es[i] != null) ? ef[i] - es[i] : null);
  const first = macdLine.findIndex((v) => v != null);
  const valid = macdLine.filter((v) => v != null);
  const sigValid = ema(valid, signalP);
  const signalLine = new Array(arr.length).fill(null);
  for (let i = 0; i < sigValid.length; i++) signalLine[first + i] = sigValid[i];
  const hist = macdLine.map((v, i) => (v != null && signalLine[i] != null) ? v - signalLine[i] : null);
  return { macdLine, signalLine, hist };
};
const bb = (arr, period = 20, k = 2) => {
  if (!arr?.length || arr.length < period) {
    const empty = new Array(arr?.length || 0).fill(null);
    return { upper: empty, middle: empty, lower: empty };
  }
  const mid = sma(arr, period);
  const up = new Array(arr.length).fill(null);
  const lo = new Array(arr.length).fill(null);
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) continue;
    const win = arr.slice(i - period + 1, i + 1).filter(Number.isFinite);
    const m = mid[i]; if (!Number.isFinite(m)) continue;
    const sd = stdev(win);
    up[i] = m + k * sd; lo[i] = m - k * sd;
  }
  return { upper: up, middle: mid, lower: lo };
};

/* =========================================================================
   4) CORE CALC (คะแนน+สัญญาณ)
   ========================================================================= */
function buildCtx(series) {
  const c = series.map((d) => toNum(d.ClosePrice));
  const ma50 = sma(c, 50), ma200 = sma(c, 200);
  const ema10a = ema(c, 10), ema20a = ema(c, 20), ema12a = ema(c, 12), ema26a = ema(c, 26);
  const r = rsi(c, 14);
  const m = macd(c, 12, 26, 9);
  const b = bb(c, 20, 2);
  return { closes: c, ma50, ma200, ema10a, ema20a, ema12a, ema26a, rsi: r, macd: m, bb: b };
}
function scoreAt(i, ctx) {
  const { closes, ma50, ma200, rsi, macd: { macdLine, signalLine }, bb } = ctx;
  const price = closes[i]; if (!Number.isFinite(price)) return { score: 0, reasons: [] };
  let trend = 0, mom = 0, mr = 0, vol = 0; const base = Math.max(price, 1e-6);
  const reasons = [];

  // Trend
  if (ma50[i] != null && ma200[i] != null) {
    const gap = ma50[i] - ma200[i];
    trend += clamp(gap / (base * 0.02), -1, 1);
    if (i >= 5 && ma50[i - 5] != null) trend += 0.3 * clamp((ma50[i] - ma50[i - 5]) / (base * 0.01), -1, 1);
    reasons.push(gap > 0 ? 'MA50 > MA200' : 'MA50 < MA200');
  }
  // Momentum
  if (macdLine[i] != null && signalLine[i] != null) {
    const md = macdLine[i] - signalLine[i];
    mom += 0.7 * clamp(md / (base * 0.005), -1, 1);
    reasons.push(md > 0 ? 'MACD > Signal' : 'MACD < Signal');
  }
  if (rsi[i] != null) {
    mom += 0.3 * clamp((rsi[i] - 50) / 50, -1, 1);
    if (rsi[i] > 55) reasons.push('RSI>50');
    if (rsi[i] < 45) reasons.push('RSI<50');
  }
  // Mean-reversion
  if (bb.upper[i] != null && bb.lower[i] != null) {
    if (price <= bb.lower[i]) { mr += 0.8; reasons.push('Touch Lower BB'); }
    if (price >= bb.upper[i]) { mr -= 0.8; reasons.push('Touch Upper BB'); }
  }
  // Volatility hint
  if (macdLine[i] != null && signalLine[i] != null && bb.middle[i] != null) {
    const md = macdLine[i] - signalLine[i];
    vol += 0.1 * sign(md);
  }

  const W_T = 0.4, W_M = 0.3, W_R = 0.2, W_V = 0.1;
  const score = W_T * clamp(trend, -1, 1) + W_M * clamp(mom, -1, 1) + W_R * clamp(mr, -1, 1) + W_V * clamp(vol, -1, 1);
  return { score, reasons };
}
function computeTechnical(series) {
  if (!series?.length) return null;
  const ctx = buildCtx(series);
  const i = ctx.closes.length - 1;
  const price = ctx.closes[i];

  const v = {
    ma50: ctx.ma50[i], ma200: ctx.ma200[i],
    ema10: ctx.ema10a[i], ema20: ctx.ema20a[i],
    ema12: ctx.ema12a[i], ema26: ctx.ema26a[i],
    rsi: ctx.rsi[i],
    macd: ctx.macd.macdLine[i], macdSig: ctx.macd.signalLine[i],
    bbUp: ctx.bb.upper[i], bbMd: ctx.bb.middle[i], bbLo: ctx.bb.lower[i],
  };

  const { score, reasons } = scoreAt(i, ctx);
  const BUY_TH = 0.20, SELL_TH = -0.20;
  let signal = 'HOLD';
  if (score >= BUY_TH) signal = 'BUY';
  else if (score <= SELL_TH) signal = 'SELL';

  const parts =
    (v.ma50 != null && v.ma200 != null ? 1 : 0) +
    (v.macd != null && v.macdSig != null ? 1 : 0) +
    (v.rsi != null ? 1 : 0) +
    (v.bbUp != null && v.bbLo != null ? 1 : 0);
  const coverage = parts / 4;
  const confidence = Math.round(100 * clamp(Math.abs(score) * (0.6 + 0.4 * coverage), 0, 1));

  return { ctx, price, v, score, signal, confidence, reasons };
}
function backtestFull(fullSeries) {
  if (!fullSeries?.length || fullSeries.length < INDICATOR_MIN) {
    return { effectiveness: 0, hits: 0, total: 0, lookahead: LOOKAHEAD };
  }
  const ctx = buildCtx(fullSeries);
  const n = ctx.closes.length;
  const BUY_TH = 0.20, SELL_TH = -0.20;

  let total = 0, hits = 0;
  let prevScore = null, lastSide = 'FLAT';

  for (let t = 200; t < n - LOOKAHEAD; t++) {
    if ([ctx.ma200[t], ctx.macd.signalLine[t], ctx.rsi[t], ctx.bb.middle[t]].some(x => x == null)) continue;

    const { score } = scoreAt(t, ctx);
    if (prevScore == null) { prevScore = score; continue; }

    let sig = 'HOLD';
    if (prevScore < BUY_TH && score >= BUY_TH) sig = 'BUY';
    else if (prevScore > SELL_TH && score <= SELL_TH) sig = 'SELL';
    prevScore = score;

    if (sig === 'HOLD' || sig === lastSide) continue;
    lastSide = sig;

    const pv = ctx.closes[t], fv = ctx.closes[t + LOOKAHEAD];
    if (!Number.isFinite(pv) || !Number.isFinite(fv)) continue;
    const ok = sig === 'BUY' ? fv > pv : fv < pv;
    total++; if (ok) hits++;
  }
  const eff = total ? Math.round((hits / total) * 100) : 0;
  return { effectiveness: eff, hits, total, lookahead: LOOKAHEAD };
}

/* =========================================================================
   5) UI STYLES
   ========================================================================= */
const Main = styled.div`flex:1; display:flex; flex-direction:column; align-items:center; padding:20px; color:#e0e0e0;`;
const Header = styled.header`width:100%; background:#ff8c00; color:#fff; padding:15px; border-radius:10px; font-size:28px; font-weight:700; text-align:center; margin-bottom:20px;`;
const Box = styled.div`background:#1e1e1e; border:1px solid #333; border-radius:12px; box-shadow:0 5px 15px rgba(0,0,0,.3); padding:25px; width:100%; max-width:1400px;`;
const H3 = styled.h3`color:#ff8c00; border-bottom:2px solid #ff8c00; padding-bottom:10px; margin:0 0 20px 0; font-size:22px;`;
const Row = styled.div`display:flex; gap:15px; flex-wrap:wrap; margin-bottom:16px; align-items:center;`;
const Select = styled.select`background:#333; color:#fff; border:1px solid rgba(255,255,255,.3); border-radius:8px; padding:10px; font-weight:700;`;
const Grid = styled.div`display:grid; grid-template-columns:repeat(auto-fit, minmax(280px,1fr)); gap:20px;`;
const Card = styled.div`background:#2a2a2a; border-left:5px solid ${p=>p.color||'#ff8c00'}; border-radius:10px; padding:18px;`;
const Title = styled.h4`margin:0 0 8px 0; color:#e0e0e0;`;
const Val = styled.p`margin:0; color:#ffbd66; font-weight:700; line-height:1.6;`;
const SigText = styled.p`margin:6px 0 0 0; font-weight:700; color:${p=>p.color||'#a0a0a0'};`;
const Strat = styled.div`background:linear-gradient(45deg,#2a2a2a,#333); border-radius:12px; padding:20px; display:flex; gap:20px; flex-wrap:wrap; justify-content:space-between;`;
const Big = styled.p`font-size:48px; font-weight:800; margin:8px 0 0 0; color:${p=>p.s==='BUY'?'#28a745':p.s==='SELL'?'#dc3545':'#6c757d'};`;
const StatsCard = styled(Card)`
  grid-column: span 2;
  @media (max-width: 1100px) { grid-column: span 1; }
`;

/* =========================================================================
   6) PAGE
   ========================================================================= */
export default function MarketTrendAnalysis() {
  const { search } = useLocation();
  const qs = useMemo(() => new URLSearchParams(search), [search]);

  const qMarket = qs.get('market');   // 'Thailand'|'America'
  const qSymbol = qs.get('symbol');   // e.g. 'PTT'
  const qTf     = qs.get('timeframe') || DEFAULT_TF;

  const initCountry = MARKET_TO_COUNTRY[qMarket] || 'TH';
  const initSymbol  = qSymbol || DEFAULT_SYMBOL_BY_COUNTRY[initCountry];

  const [country, setCountry] = useState(initCountry);
  const [symbol, setSymbol] = useState(initSymbol);
  const [tf, setTf] = useState(qTf);

  const [symbols, setSymbols] = useState([]);
  const [series, setSeries] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const market = COUNTRY_TO_MARKET[country];

  // ดึงรายชื่อหุ้น
  useEffect(() => {
    (async () => {
      try {
        setErr('');
        const { data } = await axios.get(`${API_BASE}/symbols?market=${encodeURIComponent(market)}`, auth());
        const list = (data?.data || []).map(r => ({ symbol: r.StockSymbol, name: r.CompanyName || r.StockSymbol }));
        setSymbols(list);
        if (!list.some(x => x.symbol === symbol)) {
          setSymbol(DEFAULT_SYMBOL_BY_COUNTRY[country] || list[0]?.symbol || '');
        }
      } catch (e) {
        console.error(e);
        setErr(e?.response?.data?.error || 'โหลดรายชื่อหุ้นไม่สำเร็จ');
        setSymbols([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  // ดึงซีรีส์ข้อมูล
  useEffect(() => {
    if (!symbol) return;
    const controller = new AbortController();
    (async () => {
      try {
        setLoading(true); setErr('');
        const need = Math.max(TF_LIMIT[tf] ?? TF_LIMIT[DEFAULT_TF], INDICATOR_MIN);
        const { data } = await axios.get(`${API_BASE}/data?symbol=${encodeURIComponent(symbol)}&limit=${need}`, { ...auth(), signal: controller.signal });
        const raw = data?.series || [];
        const cleaned = raw.filter(r => Number(r?.Volume) > 0); // ข้ามวันหยุด
        setSeries(cleaned);
      } catch (e) {
        if (e.name === 'CanceledError') return;
        console.error(e);
        setErr(e?.response?.data?.error || 'โหลดข้อมูลหุ้นไม่สำเร็จ');
        setSeries([]);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [symbol, tf]);

  // window สำหรับคำนวณอินดี้ตาม timeframe
  const win = useMemo(() => {
    if (!series.length) return [];
    if (tf === 'ALL') return series;
    const n = TF_LIMIT[tf] ?? TF_LIMIT[DEFAULT_TF];
    return series.slice(-n);
  }, [series, tf]);

  // คำนวณอินดี้ล่าสุดในหน้าต่าง
  const tech = useMemo(() => computeTechnical(win), [win]);

  // สถิติ timeframe (Return, Vol, MDD)
  const tfStats = useMemo(() => {
    if (!win.length) return null;
    const closes = win.map(d => Number(d.ClosePrice)).filter(Number.isFinite);
    if (!closes.length) return null;
    const ret = (closes.at(-1) - closes[0]) / closes[0];
    const rets = [];
    for (let i = 1; i < closes.length; i++) {
      if (Number.isFinite(closes[i]) && Number.isFinite(closes[i - 1])) {
        rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }
    }
    const vol = stdev(rets);
    const mdd = maxDrawdown(closes); // negative
    return { bars: closes.length, returnPct: ret * 100, volPct: vol * 100, mddPct: mdd * 100 };
  }, [win]);

  // backtest ซีรีส์เต็ม
  const bt = useMemo(() => backtestFull(series), [series]);

  return (
    <Main>
      <Header>Market Trend Analysis</Header>
      <Box>
        <H3>Technical Indicator Analysis</H3>

        <Row>
          <label><b>Select Market:&nbsp;</b></label>
          <Select value={country} onChange={e => setCountry(e.target.value)}>
            <option value="TH">Thailand (TH)</option>
            <option value="USA">United States (USA)</option>
          </Select>

          <label><b>Select Stock:&nbsp;</b></label>
          <Select value={symbol} onChange={e => setSymbol(e.target.value)}>
            {symbols.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
          </Select>

          <label><b>Timeframe:&nbsp;</b></label>
          <Select value={tf} onChange={e => setTf(e.target.value)}>
            {Object.keys(TF_LIMIT).map(k => <option key={k} value={k}>{k}</option>)}
          </Select>
        </Row>

        {err && <p style={{color:'#dc3545'}}>{err}</p>}
        {loading && <p style={{color:'#a0a0a0'}}>Loading…</p>}

        {tech ? (
          <>
            {/* แถวอินดี้ 4 การ์ด */}
            <Grid>
              <Card color={tech.v.ma50 != null && tech.v.ma200 != null ? (tech.v.ma50 > tech.v.ma200 ? '#28a745' : '#dc3545') : '#6c757d'}>
                <Title>Moving Averages (MA / EMA)</Title>
                <Val>
                  MA50: {tech.v.ma50 != null ? tech.v.ma50.toFixed(2) : '-'}<br/>
                  MA200: {tech.v.ma200 != null ? tech.v.ma200.toFixed(2) : '-'}<br/>
                  EMA10: {tech.v.ema10 != null ? tech.v.ema10.toFixed(2) : '-'} &nbsp;|&nbsp;
                  EMA20: {tech.v.ema20 != null ? tech.v.ema20.toFixed(2) : '-'}<br/>
                  EMA12: {tech.v.ema12 != null ? tech.v.ema12.toFixed(2) : '-'} &nbsp;|&nbsp;
                  EMA26: {tech.v.ema26 != null ? tech.v.ema26.toFixed(2) : '-'}
                </Val>
                <SigText color={tech.v.ma50 != null && tech.v.ma200 != null ? (tech.v.ma50 > tech.v.ma200 ? '#28a745' : '#dc3545') : '#6c757d'}>
                  {tech.v.ma50 != null && tech.v.ma200 != null
                    ? (tech.v.ma50 > tech.v.ma200 ? 'Golden Cross (Uptrend Bias)' : 'Death Cross (Downtrend Bias)')
                    : 'Neutral'}
                </SigText>
              </Card>

              <Card color={tech.v.rsi != null ? (tech.v.rsi >= 70 ? '#dc3545' : tech.v.rsi > 50 ? '#28a745' : '#dc3545') : '#6c757d'}>
                <Title>RSI (14)</Title>
                <Val style={{fontSize:24}}>{tech.v.rsi != null ? tech.v.rsi.toFixed(2) : '-'}</Val>
                <SigText color={tech.v.rsi != null ? (tech.v.rsi >= 70 ? '#dc3545' : tech.v.rsi > 50 ? '#28a745' : '#dc3545') : '#6c757d'}>
                  {tech.v.rsi == null ? 'Neutral' :
                    tech.v.rsi >= 70 ? 'Overbought' :
                    tech.v.rsi <= 30 ? 'Oversold' :
                    tech.v.rsi > 50 ? 'Bullish Momentum' : 'Bearish Momentum'}
                </SigText>
              </Card>

              <Card color={tech.v.macd != null && tech.v.macdSig != null ? (tech.v.macd > tech.v.macdSig ? '#28a745' : '#dc3545') : '#6c757d'}>
                <Title>MACD (12,26,9)</Title>
                <Val>
                  MACD: {tech.v.macd != null ? tech.v.macd.toFixed(4) : '-'}<br/>
                  Signal: {tech.v.macdSig != null ? tech.v.macdSig.toFixed(4) : '-'}
                </Val>
                <SigText color={tech.v.macd != null && tech.v.macdSig != null ? (tech.v.macd > tech.v.macdSig ? '#28a745' : '#dc3545') : '#6c757d'}>
                  {tech.v.macd != null && tech.v.macdSig != null
                    ? (tech.v.macd > tech.v.macdSig ? 'Bullish Crossover' : 'Bearish Crossover')
                    : 'Neutral'}
                </SigText>
              </Card>

              <Card color={tech.price != null && tech.v.bbUp != null && tech.v.bbLo != null ? (tech.price >= tech.v.bbUp ? '#dc3545' : tech.price <= tech.v.bbLo ? '#28a745' : '#6c757d') : '#6c757d'}>
                <Title>Bollinger Bands (20,2)</Title>
                <Val>
                  Upper: {tech.v.bbUp != null ? tech.v.bbUp.toFixed(2) : '-'}<br/>
                  Middle: {tech.v.bbMd != null ? tech.v.bbMd.toFixed(2) : '-'}<br/>
                  Lower: {tech.v.bbLo != null ? tech.v.bbLo.toFixed(2) : '-'}
                </Val>
                <SigText color={tech.price != null && tech.v.bbUp != null && tech.v.bbLo != null ? (tech.price >= tech.v.bbUp ? '#dc3545' : tech.price <= tech.v.bbLo ? '#28a745' : '#6c757d') : '#6c757d'}>
                  {tech.price != null && tech.v.bbUp != null && tech.v.bbLo != null
                    ? (tech.price >= tech.v.bbUp ? 'Price at/above Upper Band'
                      : tech.price <= tech.v.bbLo ? 'Price at/below Lower Band'
                      : 'Price near Middle Band')
                    : 'Price near Middle Band'}
                </SigText>
              </Card>
            </Grid>

            {/* Window Stats แยกเป็นบล็อกใหญ่ */}
            <Grid style={{ marginTop: 20 }}>
              <StatsCard color="#ff8c00">
                <Title>Window Stats ({tf})</Title>
                <Val>
                  Bars: {tfStats?.bars ?? '-'}<br/>
                  Return: {tfStats ? `${tfStats.returnPct.toFixed(2)}%` : '-'}<br/>
                  Volatility (sd): {tfStats ? `${tfStats.volPct.toFixed(2)}%` : '-'}<br/>
                  Max Drawdown: {tfStats ? `${tfStats.mddPct.toFixed(2)}%` : '-'}
                </Val>
                <SigText>Calculated on last {win.length} bars</SigText>
              </StatsCard>
            </Grid>

            <H3 style={{marginTop:30}}>Strategy & Signals</H3>
            <Strat>
              <div>
                <p style={{margin:0, color:'#a0a0a0'}}>LATEST SIGNAL</p>
                <Big s={tech.signal}>{tech.signal}</Big>
              </div>
              <div style={{minWidth:300}}>
                <p><b>Reason:</b> {tech.signal === 'HOLD' ? 'สภาวะยังไม่ชัดเจน (คะแนนกลาง ๆ)' : tech.reasons.slice(0,3).join(' • ')}</p>
                <p><b>Signal Price:</b> {fmtMoney(tech.price, market)}</p>
                <p><b>Confidence:</b> {tech.confidence}%</p>
                {bt.total >= 20 ? (
                  <p><b>Strategy Effectiveness (mini-backtest):</b> {bt.effectiveness}% (hits {bt.hits}/{bt.total}, lookahead {bt.lookahead})</p>
                ) : (
                  <p style={{color:'#9ca3af'}}>Backtest not shown (insufficient signals in full history).</p>
                )}
              </div>
            </Strat>
          </>
        ) : (
          <p style={{color:'#a0a0a0'}}>Loading technical data…</p>
        )}
      </Box>
    </Main>
  );
}
