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

/** Timeframe -> จำนวนแท่ง */
const TF_LIMIT = {

  '1M': 22,
  '3M': 66,
  '6M': 132,
  '1Y': 252,
  'ALL': 320,
};
const DEFAULT_TF = '1M';

/** โหลดลึกพอสำหรับ MA200/MACD/BB/RSI และวอร์มอัป */
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

const takeNum = (row, ...keys) => {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return Number(row[k]);
  }
  return null;
};

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
  return mdd; // negative
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

/* ===== NEW: True Range & ATR (Wilder) ===== */
const trueRange = (h, l, c) => {
  const n = Math.max(h.length, l.length, c.length);
  const tr = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const hi = h[i], lo = l[i], pc = i > 0 ? c[i - 1] : null;
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) { tr[i] = null; continue; }
    const a = hi - lo;
    const b = (pc != null && Number.isFinite(pc)) ? Math.abs(hi - pc) : null;
    const d = (pc != null && Number.isFinite(pc)) ? Math.abs(lo - pc) : null;
    tr[i] = Math.max(a, b ?? -Infinity, d ?? -Infinity);
  }
  return tr;
};
const atr = (h, l, c, period = 14) => {
  const tr = trueRange(h, l, c);
  if (!tr.length) return [];
  const out = new Array(tr.length).fill(null);
  // initial ATR = average of first 'period' TR values after skipping nulls
  let acc = 0, cnt = 0, start = -1;
  for (let i = 0; i < tr.length; i++) {
    if (tr[i] == null) continue;
    acc += tr[i]; cnt++;
    if (cnt === period) { out[i] = acc / period; start = i; break; }
  }
  if (start < 0) return out;
  for (let i = start + 1; i < tr.length; i++) {
    if (tr[i] == null || out[i - 1] == null) { out[i] = out[i - 1]; continue; }
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period; // Wilder's smoothing
  }
  return out;
};

/* ===== NEW: Keltner Channel (EMA(typical,20) ± 2*ATR(10)) ===== */
const keltner = (h, l, c, emaP = 20, atrP = 10, mult = 2) => {
  const typical = h.map((_, i) => {
    const hi = h[i], lo = l[i], cl = c[i];
    return (Number.isFinite(hi) && Number.isFinite(lo) && Number.isFinite(cl)) ? (hi + lo + cl) / 3 : null;
  });
  const mid = ema(typical, emaP);
  const a10 = atr(h, l, c, atrP);
  const up = mid.map((m, i) => (m != null && a10[i] != null) ? m + mult * a10[i] : null);
  const lo = mid.map((m, i) => (m != null && a10[i] != null) ? m - mult * a10[i] : null);
  return { upper: up, middle: mid, lower: lo };
};

/* ===== NEW: Chaikin Volatility (EMA(H-L,n) ROC over k) ===== */
const chaikinVolatility = (h, l, n = 10, k = 10) => {
  const hl = h.map((_, i) => (Number.isFinite(h[i]) && Number.isFinite(l[i])) ? (h[i] - l[i]) : null);
  const smooth = ema(hl, n);
  const out = new Array(hl.length).fill(null);
  for (let i = k; i < smooth.length; i++) {
    const prev = smooth[i - k];
    if (smooth[i] != null && prev != null && prev !== 0) {
      out[i] = ((smooth[i] - prev) / prev) * 100;
    } else {
      out[i] = null;
    }
  }
  return out;
};

/* ===== NEW: Donchian Channel (period) ===== */
const donchian = (h, l, period = 20) => {
  const up = new Array(h.length).fill(null);
  const lo = new Array(h.length).fill(null);
  for (let i = 0; i < h.length; i++) {
    if (i < period - 1) continue;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (Number.isFinite(h[j])) hh = Math.max(hh, h[j]);
      if (Number.isFinite(l[j])) ll = Math.min(ll, l[j]);
    }
    up[i] = hh !== -Infinity ? hh : null;
    lo[i] = ll !== Infinity ? ll : null;
  }
  return { upper: up, lower: lo };
};

/* ===== NEW: PSAR (Parabolic SAR) ===== */
const psar = (h, l, step = 0.02, maxStep = 0.2) => {
  const n = Math.max(h.length, l.length);
  if (n === 0) return [];
  const out = new Array(n).fill(null);
  let isUp = true;
  let af = step;
  let ep = h[0]; // extreme point
  let sar = l[0];

  // bootstrap second bar
  if (Number.isFinite(h[1]) && Number.isFinite(l[1])) {
    isUp = h[1] >= h[0];
    ep = isUp ? Math.max(h[0], h[1]) : Math.min(l[0], l[1]);
    sar = isUp ? Math.min(l[0], l[1]) : Math.max(h[0], h[1]);
    out[1] = sar;
  }

  for (let i = 2; i < n; i++) {
    if (!Number.isFinite(h[i]) || !Number.isFinite(l[i])) { out[i] = out[i - 1]; continue; }

    sar = sar + af * (ep - sar);

    // ในขาขึ้น SAR ห้ามสูงกว่า low ของสองแท่งก่อนหน้า
    if (isUp) {
      sar = Math.min(sar, l[i - 1], l[i - 2] ?? l[i - 1]);
      if (h[i] > ep) { ep = h[i]; af = Math.min(af + step, maxStep); }
      if (l[i] < sar) { // reverse
        isUp = false;
        sar = ep;
        ep = l[i];
        af = step;
      }
    } else { // ขาลง SAR ห้ามต่ำกว่า high ของสองแท่งก่อนหน้า
      sar = Math.max(sar, h[i - 1], h[i - 2] ?? h[i - 1]);
      if (l[i] < ep) { ep = l[i]; af = Math.min(af + step, maxStep); }
      if (h[i] > sar) { // reverse
        isUp = true;
        sar = ep;
        ep = h[i];
        af = step;
      }
    }

    out[i] = sar;
  }
  return out;
};

/* =========================================================================
   4) CORE CALC (คะแนน+สัญญาณ)
   ========================================================================= */
function buildCtx(series) {
  // รองรับชื่อคอลัมน์ High/Low หลายแบบ
  const closes = series.map((d) => takeNum(d, 'ClosePrice', 'Close', 'Adj Close', 'AdjClose'));
  const highs  = series.map((d) => takeNum(d, 'HighPrice', 'High'));
  const lows   = series.map((d) => takeNum(d, 'LowPrice', 'Low'));

  const ma50 = sma(closes, 50), ma200 = sma(closes, 200);
  const ema10a = ema(closes, 10), ema20a = ema(closes, 20), ema12a = ema(closes, 12), ema26a = ema(closes, 26);
  const r = rsi(closes, 14);
  const m = macd(closes, 12, 26, 9);
  const b = bb(closes, 20, 2);

  // NEW
  const atr14 = atr(highs, lows, closes, 14);
  const kc    = keltner(highs, lows, closes, 20, 10, 2);
  const chkv  = chaikinVolatility(highs, lows, 10, 10);
  const dch   = donchian(highs, lows, 20);
  const ps    = psar(highs, lows, 0.02, 0.2);

  return {
    closes, highs, lows,
    ma50, ma200, ema10a, ema20a, ema12a, ema26a,
    rsi: r, macd: m, bb: b,
    atr14, kc, chkv, dch, ps
  };
}
function scoreAt(i, ctx) {
  const { closes, ma50, ma200, rsi, macd: { macdLine, signalLine }, bb } = ctx;
  const price = closes[i]; if (!Number.isFinite(price)) return { score: 0, reasons: [] };
  let trend = 0, mom = 0, mr = 0, vol = 0;
  const reasons = [];

  // Trend
  if (ma50[i] != null && ma200[i] != null) {
    const gap = ma50[i] - ma200[i];
    trend += clamp(gap / Math.max(price * 0.02, 1e-6), -1, 1);
    if (i >= 5 && ma50[i - 5] != null) trend += 0.3 * clamp((ma50[i] - ma50[i - 5]) / Math.max(price * 0.01, 1e-6), -1, 1);
    reasons.push(gap > 0 ? 'MA50 > MA200' : 'MA50 < MA200');
  }
  // Momentum
  if (macdLine[i] != null && signalLine[i] != null) {
    const md = macdLine[i] - signalLine[i];
    mom += 0.7 * clamp(md / Math.max(price * 0.005, 1e-6), -1, 1);
    reasons.push(md > 0 ? 'MACD > Signal' : 'MACD < Signal');
  }
  if (rsi[i] != null) {
    mom += 0.3 * clamp((rsi[i] - 50) / 50, -1, 1);
    if (rsi[i] > 55) reasons.push('RSI>50');
    if (rsi[i] < 45) reasons.push('RSI<50');
  }
  // Mean reversion จาก BB
  if (bb.upper[i] != null && bb.lower[i] != null) {
    const priceNow = price;
    if (priceNow <= bb.lower[i]) { mr += 0.8; reasons.push('Touch Lower BB'); }
    if (priceNow >= bb.upper[i]) { mr -= 0.8; reasons.push('Touch Upper BB'); }
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
    // ชุดเดิม
    SMA_50: ctx.ma50[i], SMA_200: ctx.ma200[i],
    EMA_10: ctx.ema10a[i], EMA_20: ctx.ema20a[i],
    MACD: ctx.macd.macdLine[i], MACD_Signal: ctx.macd.signalLine[i],
    RSI: ctx.rsi[i],
    Bollinger_High: ctx.bb.upper[i], Bollinger_Low: ctx.bb.lower[i], Bollinger_Middle: ctx.bb.middle[i],
    // NEW
    ATR: ctx.atr14[i],
    Keltner_High: ctx.kc.upper[i], Keltner_Low: ctx.kc.lower[i], Keltner_Middle: ctx.kc.middle[i],
    Chaikin_Vol: ctx.chkv[i],
    Donchian_High: ctx.dch.upper[i], Donchian_Low: ctx.dch.lower[i],
    PSAR: ctx.ps[i],
  };

  const { score, reasons } = scoreAt(i, ctx);
  const BUY_TH = 0.20, SELL_TH = -0.20;
  let signal = 'HOLD';
  if (score >= BUY_TH) signal = 'BUY';
  else if (score <= SELL_TH) signal = 'SELL';

  const parts =
    (v.SMA_50 != null && v.SMA_200 != null ? 1 : 0) +
    (v.MACD != null && v.MACD_Signal != null ? 1 : 0) +
    (v.RSI != null ? 1 : 0) +
    (v.Bollinger_High != null && v.Bollinger_Low != null ? 1 : 0);
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

  const qMarket = qs.get('market');
  const qSymbol = qs.get('symbol');
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

  // รายชื่อหุ้น
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

  // ซีรีส์ข้อมูล
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

  // หน้าต่างตาม timeframe
  const win = useMemo(() => {
    if (!series.length) return [];
    if (tf === 'ALL') return series;
    const n = TF_LIMIT[tf] ?? TF_LIMIT[DEFAULT_TF];
    return series.slice(-n);
  }, [series, tf]);

  // คำนวณอินดี้ล่าสุด
  const tech = useMemo(() => computeTechnical(win), [win]);

  // สถิติ timeframe
  const tfStats = useMemo(() => {
    if (!win.length) return null;
    const closes = win.map(d => Number(takeNum(d, 'ClosePrice', 'Close', 'Adj Close', 'AdjClose'))).filter(Number.isFinite);
    if (!closes.length) return null;
    const ret = (closes.at(-1) - closes[0]) / closes[0];
    const rets = [];
    for (let i = 1; i < closes.length; i++) {
      if (Number.isFinite(closes[i]) && Number.isFinite(closes[i - 1])) {
        rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }
    }
    const vol = stdev(rets);
    const mdd = maxDrawdown(closes);
    return { bars: closes.length, returnPct: ret * 100, volPct: vol * 100, mddPct: mdd * 100 };
  }, [win]);

  // mini-backtest
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
            {/* กลุ่มหลัก (MA/EMA, RSI, MACD, BB) */}
            <Grid>
              <Card color={tech.v.SMA_50 != null && tech.v.SMA_200 != null ? (tech.v.SMA_50 > tech.v.SMA_200 ? '#28a745' : '#dc3545') : '#6c757d'}>
                <Title>Moving Averages (SMA/EMA)</Title>
                <Val>
                  SMA 50: {tech.v.SMA_50 != null ? tech.v.SMA_50.toFixed(2) : '-'}<br/>
                  SMA 200: {tech.v.SMA_200 != null ? tech.v.SMA_200.toFixed(2) : '-'}<br/>
                  EMA 10: {tech.v.EMA_10 != null ? tech.v.EMA_10.toFixed(2) : '-'} &nbsp;|&nbsp;
                  EMA 20: {tech.v.EMA_20 != null ? tech.v.EMA_20.toFixed(2) : '-'}
                </Val>
                <SigText color={tech.v.SMA_50 != null && tech.v.SMA_200 != null ? (tech.v.SMA_50 > tech.v.SMA_200 ? '#28a745' : '#dc3545') : '#6c757d'}>
                  {tech.v.SMA_50 != null && tech.v.SMA_200 != null
                    ? (tech.v.SMA_50 > tech.v.SMA_200 ? 'Golden Cross (Uptrend Bias)' : 'Death Cross (Downtrend Bias)')
                    : 'Neutral'}
                </SigText>
              </Card>

              <Card color={tech.v.RSI != null ? (tech.v.RSI >= 70 ? '#dc3545' : tech.v.RSI > 50 ? '#28a745' : '#dc3545') : '#6c757d'}>
                <Title>RSI (14)</Title>
                <Val style={{fontSize:24}}>{tech.v.RSI != null ? tech.v.RSI.toFixed(2) : '-'}</Val>
                <SigText color={tech.v.RSI != null ? (tech.v.RSI >= 70 ? '#dc3545' : tech.v.RSI > 50 ? '#28a745' : '#dc3545') : '#6c757d'}>
                  {tech.v.RSI == null ? 'Neutral' :
                    tech.v.RSI >= 70 ? 'Overbought' :
                    tech.v.RSI <= 30 ? 'Oversold' :
                    tech.v.RSI > 50 ? 'Bullish Momentum' : 'Bearish Momentum'}
                </SigText>
              </Card>

              <Card color={tech.v.MACD != null && tech.v.MACD_Signal != null ? (tech.v.MACD > tech.v.MACD_Signal ? '#28a745' : '#dc3545') : '#6c757d'}>
                <Title>MACD (12,26,9)</Title>
                <Val>
                  MACD: {tech.v.MACD != null ? tech.v.MACD.toFixed(4) : '-'}<br/>
                  Signal: {tech.v.MACD_Signal != null ? tech.v.MACD_Signal.toFixed(4) : '-'}
                </Val>
                <SigText color={tech.v.MACD != null && tech.v.MACD_Signal != null ? (tech.v.MACD > tech.v.MACD_Signal ? '#28a745' : '#dc3545') : '#6c757d'}>
                  {tech.v.MACD != null && tech.v.MACD_Signal != null
                    ? (tech.v.MACD > tech.v.MACD_Signal ? 'Bullish Crossover' : 'Bearish Crossover')
                    : 'Neutral'}
                </SigText>
              </Card>

              <Card color={tech.price != null && tech.v.Bollinger_High != null && tech.v.Bollinger_Low != null ? (tech.price >= tech.v.Bollinger_High ? '#dc3545' : tech.price <= tech.v.Bollinger_Low ? '#28a745' : '#6c757d') : '#6c757d'}>
                <Title>Bollinger Bands (20,2)</Title>
                <Val>
                  Upper: {tech.v.Bollinger_High != null ? tech.v.Bollinger_High.toFixed(2) : '-'}<br/>
                  Middle: {tech.v.Bollinger_Middle != null ? tech.v.Bollinger_Middle.toFixed(2) : '-'}<br/>
                  Lower: {tech.v.Bollinger_Low != null ? tech.v.Bollinger_Low.toFixed(2) : '-'}
                </Val>
                <SigText color={tech.price != null && tech.v.Bollinger_High != null && tech.v.Bollinger_Low != null ? (tech.price >= tech.v.Bollinger_High ? '#dc3545' : tech.price <= tech.v.Bollinger_Low ? '#28a745' : '#6c757d') : '#6c757d'}>
                  {tech.price != null && tech.v.Bollinger_High != null && tech.v.Bollinger_Low != null
                    ? (tech.price >= tech.v.Bollinger_High ? 'Price at/above Upper Band'
                      : tech.price <= tech.v.Bollinger_Low ? 'Price at/below Lower Band'
                      : 'Price near Middle Band')
                    : 'Price near Middle Band'}
                </SigText>
              </Card>
            </Grid>

            {/* Advanced Indicators */}
            <H3 style={{marginTop:30}}>Advanced Indicators</H3>
            <Grid>
              <Card color="#ff8c00">
                <Title>ATR (14)</Title>
                <Val>ATR: {tech.v.ATR != null ? tech.v.ATR.toFixed(4) : '-'}</Val>
                <SigText>Average True Range</SigText>
              </Card>

              <Card color="#20c997">
                <Title>Keltner Channel</Title>
                <Val>
                  High: {tech.v.Keltner_High != null ? tech.v.Keltner_High.toFixed(2) : '-'}<br/>
                  Middle: {tech.v.Keltner_Middle != null ? tech.v.Keltner_Middle.toFixed(2) : '-'}<br/>
                  Low: {tech.v.Keltner_Low != null ? tech.v.Keltner_Low.toFixed(2) : '-'}
                </Val>
                <SigText>EMA(typical,20) ± 2 × ATR(10)</SigText>
              </Card>

              <Card color="#0dcaf0">
                <Title>Chaikin Volatility</Title>
                <Val>{tech.v.Chaikin_Vol != null ? `${tech.v.Chaikin_Vol.toFixed(2)}%` : '-'}</Val>
                <SigText>ROC(10) of EMA(High−Low,10)</SigText>
              </Card>

              <Card color="#a78bfa">
                <Title>Donchian Channel (20)</Title>
                <Val>
                  Upper: {tech.v.Donchian_High != null ? tech.v.Donchian_High.toFixed(2) : '-'}<br/>
                  Lower: {tech.v.Donchian_Low != null ? tech.v.Donchian_Low.toFixed(2) : '-'}
                </Val>
                <SigText>20-bar Highest / Lowest</SigText>
              </Card>

              <Card color="#f97316">
                <Title>Parabolic SAR</Title>
                <Val>PSAR: {tech.v.PSAR != null ? tech.v.PSAR.toFixed(2) : '-'}</Val>
                <SigText>step 0.02, max 0.2</SigText>
              </Card>
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
