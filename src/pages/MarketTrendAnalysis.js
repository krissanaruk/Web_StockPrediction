// src/pages/MarketTrendAnalysis.js
// MIXED MODE:
// - LATEST SIGNAL = ซีรีส์เต็ม (GLOBAL)
// - Core/Advanced = คำนวณจาก window ตาม timeframe (WINDOW)

import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import { useLocation } from 'react-router-dom';

/* =========================================================================
   1) THEME & CONFIG (โทนอ่านง่าย สื่อสัญญาณชัดเจน)
   ========================================================================= */
const THEME = {
  background: '#0f0f0f',
  surface: '#1e1e1e',
  surfaceAlt: '#1b1b1b',
  text: '#f1f1f1',
  textMuted: '#9a9a9a',
  border: '#2a2a2a',
  borderAlt: '#333',
  shadow: '0 5px 15px rgba(0,0,0,0.35)',

  brand: '#ff8c00',   // ใช้เฉพาะหัวข้อ/เส้นคั่น
  onBrand: '#ffffff',

  bullish: '#00c46a', // เขียว (สัญญาณบวก)
  bearish: '#ff4c4c', // แดง (สัญญาณลบ)
  neutral: '#b0b0b0', // เทา (กลาง/ไม่ชัด)
  value: '#ffcc66',   // สีตัวเลข

  // พื้นหลังชิปแบบโปร่งเพื่ออ่านง่ายบนดาร์ค
  chipBullBg: 'rgba(0,196,106,0.16)',
  chipBearBg: 'rgba(255,76,76,0.16)',
  chipNeutBg: 'rgba(176,176,176,0.16)',
};

// พื้นหลังไล่เฉดให้เหมือน LATEST SIGNAL
const SIGNAL_BG = 'linear-gradient(45deg,#1b1b1b,#232323)';

// ใช้สี "ตามสัญญาณ" (ไม่ใช้ส้มแบรนด์) เพื่อสอดคล้องทั้งหน้า
const ACCENT_MODE = 'status';
const accent = (statusColor) => (ACCENT_MODE === 'status' ? statusColor : THEME.brand);

const API_BASE = 'http://localhost:3000/api/market-trend';
const COUNTRY_TO_MARKET = { TH: 'Thailand', USA: 'America' };
const MARKET_TO_COUNTRY = { Thailand: 'TH', America: 'USA' };
const DEFAULT_SYMBOL_BY_COUNTRY = { TH: 'ADVANC', USA: 'AAPL' };

const TIMEFRAME_TO_LIMIT = { '1M': 22, '3M': 66, '6M': 132, '1Y': 252, 'ALL': 320 };
const DEFAULT_TIMEFRAME = '1M';

const LOOKBACKS = [200, 26 + 9, 20, 14];
const WARMUP = 30;
const LOOKAHEAD = 5;
const INDICATOR_MIN = Math.max(...LOOKBACKS) + WARMUP + LOOKAHEAD;
const FORCE_MIN_BARS = 600;

const CURRENCY_BY_MARKET = { Thailand: 'THB', America: 'USD' };
const formatMoneyByMarket = (value, market) => {
  if (value == null || !Number.isFinite(Number(value))) return 'N/A';
  const currency = CURRENCY_BY_MARKET[market] || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency === 'THB' ? '฿' : '$'}${Number(value).toFixed(2)}`;
  }
};
const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

/* =========================================================================
   2) HELPERS
   ========================================================================= */
const toNumberOrNull = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[, ]+/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const takeNumberFromRow = (row, ...keys) => {
  for (const k of keys) if (row[k] != null && row[k] !== '') return toNumberOrNull(row[k]);
  return null;
};
const standardDeviation = (arr) => {
  const values = arr.filter(Number.isFinite);
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
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
    if (prev == null) prev = v; else prev = v * k + prev * (1 - k);
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
    const sd = standardDeviation(win);
    up[i] = m + k * sd; lo[i] = m - k * sd;
  }
  return { upper: up, middle: mid, lower: lo };
};
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
  let acc = 0, cnt = 0, start = -1;
  for (let i = 0; i < tr.length; i++) {
    if (tr[i] == null) continue;
    acc += tr[i]; cnt++;
    if (cnt === period) { out[i] = acc / period; start = i; break; }
  }
  if (start < 0) return out;
  for (let i = start + 1; i < tr.length; i++) {
    if (tr[i] == null || out[i - 1] == null) { out[i] = out[i - 1]; continue; }
    out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
};
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
const chaikinVolatility = (h, l, n = 10, k = 10) => {
  const hl = h.map((_, i) => (Number.isFinite(h[i]) && Number.isFinite(l[i])) ? (h[i] - l[i]) : null);
  const smooth = ema(hl, n);
  const out = new Array(hl.length).fill(null);
  for (let i = k; i < smooth.length; i++) {
    const prev = smooth[i - k];
    if (smooth[i] != null && prev != null && prev !== 0) {
      out[i] = ((smooth[i] - prev) / prev) * 100;
    } else out[i] = null;
  }
  return out;
};
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
const psar = (h, l, step = 0.02, maxStep = 0.2) => {
  const n = Math.max(h.length, l.length);
  if (n === 0) return [];
  const out = new Array(n).fill(null);
  let isUp = true, af = step, ep = h[0], sar = l[0];
  if (Number.isFinite(h[1]) && Number.isFinite(l[1])) {
    isUp = h[1] >= h[0];
    ep = isUp ? Math.max(h[0], h[1]) : Math.min(l[0], l[1]);
    sar = isUp ? Math.min(l[0], l[1]) : Math.max(h[0], h[1]);
    out[1] = sar;
  }
  for (let i = 2; i < n; i++) {
    if (!Number.isFinite(h[i]) || !Number.isFinite(l[i])) { out[i] = out[i - 1]; continue; }
    sar = sar + af * (ep - sar);
    if (isUp) {
      sar = Math.min(sar, l[i - 1], l[i - 2] ?? l[i - 1]);
      if (h[i] > ep) { ep = h[i]; af = Math.min(af + step, maxStep); }
      if (l[i] < sar) { isUp = false; sar = ep; ep = l[i]; af = step; }
    } else {
      sar = Math.max(sar, h[i - 1], h[i - 2] ?? h[i - 1]);
      if (l[i] < ep) { ep = l[i]; af = Math.min(af + step, maxStep); }
      if (h[i] > sar) { isUp = true; sar = ep; ep = h[i]; af = step; }
    }
    out[i] = sar;
  }
  return out;
};

/* =========================================================================
   4) CORE CALC (คะแนน+สัญญาณ)
   ========================================================================= */
function buildContextFromSeries(series) {
  const closes = series.map((d) =>
    takeNumberFromRow(d, 'ClosePrice', 'Close', 'Adj Close', 'AdjClose', 'close', 'C')
  );
  const highs  = series.map((d) => takeNumberFromRow(d, 'HighPrice', 'High', 'high', 'H'));
  const lows   = series.map((d) => takeNumberFromRow(d, 'LowPrice', 'Low', 'low', 'L'));

  const ma50 = sma(closes, 50), ma200 = sma(closes, 200);
  const ema10a = ema(closes, 10), ema20a = ema(closes, 20);
  const rsiValues = rsi(closes, 14);
  const macdValues = macd(closes, 12, 26, 9);
  const bollinger = bb(closes, 20, 2);

  const atr14 = atr(highs, lows, closes, 14);
  const keltner20 = keltner(highs, lows, closes, 20, 10, 2);
  const chaikinVol = chaikinVolatility(highs, lows, 10, 10);
  const donchian20 = donchian(highs, lows, 20);
  const psarVal = psar(highs, lows, 0.02, 0.2);

  return {
    closes, highs, lows,
    ma50, ma200, ema10a, ema20a,
    rsi: rsiValues, macd: macdValues, bb: bollinger,
    atr14, kc: keltner20, chkv: chaikinVol, dch: donchian20, ps: psarVal
  };
}
function scoreAt(index, ctx) {
  const { closes, ma50, ma200, rsi, macd: { macdLine, signalLine }, bb } = ctx;
  const price = closes[index];
  if (!Number.isFinite(price)) return { score: 0, reasons: ['ราคา: ข้อมูลไม่พอ'] };

  let trend = 0, momentum = 0, meanReversion = 0, volBias = 0;
  const reasons = [];

  if (ma50[index] != null && ma200[index] != null) {
    const gap = ma50[index] - ma200[index];
    trend += clamp(gap / Math.max(price * 0.02, 1e-6), -1, 1);
    if (index >= 5 && ma50[index - 5] != null) {
      trend += 0.3 * clamp((ma50[index] - ma50[index - 5]) / Math.max(price * 0.01, 1e-6), -1, 1);
    }
    const gapPct = Math.abs(ma200[index]) ? ((gap / ma200[index]) * 100) : 0;
    reasons.push(gapPct < 0.3 ? 'MA50 ≈ MA200' : (gap > 0 ? 'MA50 > MA200' : 'MA50 < MA200'));
  } else reasons.push('MA50/MA200: ข้อมูลไม่พอ');

  if (macdLine[index] != null && signalLine[index] != null) {
    const md = macdLine[index] - signalLine[index];
    momentum += 0.7 * clamp(md / Math.max(price * 0.005, 1e-6), -1, 1);
    reasons.push(Math.abs(md) < 1e-4 ? 'MACD ≈ Signal' : (md > 0 ? 'MACD > Signal' : 'MACD < Signal'));
  } else reasons.push('MACD/Signal: ข้อมูลไม่พอ');

  if (rsi[index] != null) {
    momentum += 0.3 * clamp((rsi[index] - 50) / 50, -1, 1);
    reasons.push(
      rsi[index] >= 70 ? 'RSI ≥ 70 (Overbought)' :
      rsi[index] <= 30 ? 'RSI ≤ 30 (Oversold)' :
      rsi[index] > 50  ? 'RSI > 50' :
      rsi[index] < 50  ? 'RSI < 50' : 'RSI ≈ 50'
    );
  } else reasons.push('RSI: ข้อมูลไม่พอ');

  if (bb.upper[index] != null && bb.lower[index] != null) {
    if (price <= bb.lower[index]) { meanReversion += 0.8; reasons.push('Touch Lower BB'); }
    else if (price >= bb.upper[index]) { meanReversion -= 0.8; reasons.push('Touch Upper BB'); }
    else reasons.push('Inside Bands');
  } else reasons.push('Bollinger: ข้อมูลไม่พอ');

  if (macdLine[index] != null && signalLine[index] != null && bb.middle[index] != null) {
    const md = macdLine[index] - signalLine[index];
    volBias += 0.1 * sign(md);
  }

  const score = 0.4*clamp(trend,-1,1) + 0.3*clamp(momentum,-1,1) + 0.2*clamp(meanReversion,-1,1) + 0.1*clamp(volBias,-1,1);
  return { score, reasons };
}
function computeTechnical(series) {
  if (!series?.length) return null;
  const ctx = buildContextFromSeries(series);
  const i = ctx.closes.length - 1;
  const price = ctx.closes[i];

  const v = {
    SMA_50: ctx.ma50[i], SMA_200: ctx.ma200[i],
    EMA_10: ctx.ema10a[i], EMA_20: ctx.ema20a[i],
    MACD: ctx.macd.macdLine[i], MACD_Signal: ctx.macd.signalLine[i],
    RSI: ctx.rsi[i],
    Bollinger_High: ctx.bb.upper[i], Bollinger_Low: ctx.bb.lower[i], Bollinger_Middle: ctx.bb.middle[i],
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

  // confidence คำนวณไว้แต่ "ไม่แสดงผล" ตามที่ขอ
  const parts =
    (v.SMA_50 != null && v.SMA_200 != null ? 1 : 0) +
    (v.MACD != null && v.MACD_Signal != null ? 1 : 0) +
    (v.RSI != null ? 1 : 0) +
    (v.Bollinger_High != null && v.Bollinger_Low != null ? 1 : 0);
  const coverage = parts / 4;
  const confidence = Math.round(100 * clamp(Math.abs(score) * (0.6 + 0.4 * coverage), 0, 1));

  return { ctx, price, indicators: v, score, signal, confidence, reasons };
}

/* =========================================================================
   5) UI STYLES
   ========================================================================= */
const Main = styled.div`
  flex:1; display:flex; flex-direction:column; align-items:center; padding:20px; color:${THEME.text};
  background:${THEME.background};
`;
const Header = styled.header`
  width:100%; background:${THEME.brand}; color:${THEME.onBrand}; padding:15px; text-align:center;
  font-size:28px; font-weight:bold; box-shadow:0 4px 8px rgba(255,140,0,0.4);
  border-radius:10px; margin-bottom:20px;
`;
const Box = styled.div`
  background:${THEME.surface}; padding:20px; border-radius:10px; width:100%;
  max-width:1400px; box-shadow:${THEME.shadow}; border:1px solid ${THEME.border};
`;
const TopSection = styled.div`
  background:${SIGNAL_BG};
  border:1px solid ${THEME.borderAlt};
  border-radius:12px;
  padding:16px;
  margin-bottom:16px;
`;
const H3 = styled.h3`
  color:${THEME.brand}; border-bottom:2px solid ${THEME.brand}; padding-bottom:10px; margin:0 0 16px 0;
  font-size:20px; letter-spacing:.2px;
`;
const Row = styled.div`display:flex; gap:12px; flex-wrap:wrap; align-items:center;`;
const Label = styled.span`font-weight:700; color:${THEME.textMuted}; font-size:13px;`;
const Select = styled.select`
  background:#1f1f1f; color:#fff; border:1px solid #3a3a3a; border-radius:10px; padding:10px 12px; font-weight:700;
`;
const Grid = styled.div`display:grid; grid-template-columns:repeat(auto-fit, minmax(260px,1fr)); gap:16px;`;

// การ์ด Core/Advanced ใช้พื้นหลังไล่เฉดเดียวกับ LATEST SIGNAL
const Card = styled.div`
  background:${SIGNAL_BG};
  border:1px solid ${THEME.borderAlt};
  border-left:5px solid ${p=>p.color||THEME.brand};
  border-radius:12px;
  padding:16px;
`;
const Title = styled.h4`margin:0 0 10px 0; color:${THEME.text}; font-size:16px;`;
const Val = styled.p`margin:0; color:${THEME.value}; font-weight:700; line-height:1.6;`;
const SigText = styled.p`margin:8px 0 0 0; font-weight:700; color:${p=>p.color||THEME.textMuted};`;

const Toggle = styled.button`
  margin:12px 0 0 0; background:#262626; color:${THEME.text}; border:1px solid #3a3a3a;
  padding:10px 12px; border-radius:10px; font-weight:700; cursor:pointer;
  &:hover{background:#2c2c2c;}
`;

// LATEST SIGNAL
const SignalWrap = styled.div`
  display:flex; flex-direction:column; gap:12px;
  background:${SIGNAL_BG};
  border-radius:12px; padding:18px; border:1px solid ${THEME.borderAlt};
`;
const SignalMainRow = styled.div`
  display:flex; align-items:baseline; justify-content:space-between;
  gap:12px; margin-top:4px;
`;
const PriceBadge = styled.div`
  display:inline-flex; align-items:center; gap:8px;
  padding:6px 12px; border-radius:999px;
  background:#202020; border:1px solid #343434;
`;
const PriceLabel = styled.span`font-size:12px; color:${THEME.textMuted};`;
const PriceValue = styled.span`font-weight:800; color:${THEME.value};`;

const BigSignal = styled.p`
  font-size:42px; font-weight:900; margin:2px 0 4px 0;
  color: ${p => (p.s === 'BUY' ? THEME.bullish : (p.s === 'SELL' ? THEME.bearish : THEME.neutral))};
`;

const ChipRow = styled.div`display:flex; flex-wrap:wrap; gap:8px;`;
const Chip = styled.span`
  padding:6px 10px; border-radius:999px; font-size:12px; font-weight:700;
  background:${p=>p.type==='bull'?THEME.chipBullBg:p.type==='bear'?THEME.chipBearBg:THEME.chipNeutBg};
  color:${p=>p.type==='bull'?THEME.bullish:p.type==='bear'?THEME.bearish:THEME.textMuted};
  border:1px solid ${p=>p.type==='bull'?THEME.bullish:p.type==='bear'?THEME.bearish:THEME.borderAlt};
`;

/* =========================================================================
   6) PAGE
   ========================================================================= */
export default function MarketTrendAnalysis() {
  const { search } = useLocation();
  const queryParams = useMemo(() => new URLSearchParams(search), [search]);

  const queryMarket = queryParams.get('market');
  const querySymbol = queryParams.get('symbol');
  const queryTimeframe = queryParams.get('timeframe') || DEFAULT_TIMEFRAME;

  const initialCountry = MARKET_TO_COUNTRY[queryMarket] || 'TH';
  const initialSymbol  = querySymbol || DEFAULT_SYMBOL_BY_COUNTRY[initialCountry];

  const [country, setCountry] = useState(initialCountry);
  const [stockSymbol, setStockSymbol] = useState(initialSymbol);
  const [timeframe, setTimeframe] = useState(queryTimeframe);

  const [symbolList, setSymbolList] = useState([]);
  const [series, setSeries] = useState([]);
  const [errorText, setErrorText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(true);

  const market = COUNTRY_TO_MARKET[country];

  // รายชื่อหุ้น
  useEffect(() => {
    (async () => {
      try {
        setErrorText('');
        const { data } = await axios.get(`${API_BASE}/symbols?market=${encodeURIComponent(market)}`, getAuthHeaders());
        const list = (data?.data || []).map(r => ({ symbol: r.StockSymbol, name: r.CompanyName || r.StockSymbol }));
        setSymbolList(list);
        if (!list.some(x => x.symbol === stockSymbol)) {
          setStockSymbol(DEFAULT_SYMBOL_BY_COUNTRY[country] || list[0]?.symbol || '');
        }
      } catch (e) {
        console.error(e);
        setErrorText(e?.response?.data?.error || 'โหลดรายชื่อหุ้นไม่สำเร็จ');
        setSymbolList([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  // ซีรีส์ข้อมูล (tradingOnly=1, requireHL=1)
  useEffect(() => {
    if (!stockSymbol) return;
    const controller = new AbortController();
    (async () => {
      try {
        setIsLoading(true); setErrorText('');
        const need = Math.max(
          TIMEFRAME_TO_LIMIT[timeframe] ?? TIMEFRAME_TO_LIMIT[DEFAULT_TIMEFRAME],
          INDICATOR_MIN,
          FORCE_MIN_BARS
        );
        const url = `${API_BASE}/data?symbol=${encodeURIComponent(stockSymbol)}&limit=${need}&tradingOnly=1&requireHL=1`;
        const { data } = await axios.get(url, { ...getAuthHeaders(), signal: controller.signal });
        setSeries(data?.series || []);
      } catch (e) {
        if (e.name === 'CanceledError') return;
        console.error(e);
        setErrorText(e?.response?.data?.error || 'โหลดข้อมูลหุ้นไม่สำเร็จ');
        setSeries([]);
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [stockSymbol, timeframe]);

  // หน้าต่างข้อมูลตาม timeframe
  const windowSeries = useMemo(() => {
    if (!series.length) return [];
    if (timeframe === 'ALL') return series;
    const n = TIMEFRAME_TO_LIMIT[timeframe] ?? TIMEFRAME_TO_LIMIT[DEFAULT_TIMEFRAME];
    return series.slice(-n);
  }, [series, timeframe]);

  // GLOBAL vs WINDOW
  const signalTech = useMemo(() => computeTechnical(series), [series]);
  const cardTech   = useMemo(() => computeTechnical(windowSeries), [windowSeries]);

  // Snapshot chips (ใช้ bull/bear/neutral ให้สื่อสาร)
  const snapshotChips = useMemo(() => {
    const t = signalTech;
    if (!t) return [];
    const chips = [];
    const v = t.indicators;
    if (v.SMA_50 != null && v.SMA_200 != null) {
      const up = v.SMA_50 > v.SMA_200;
      chips.push({ label: up ? 'MA: Golden Cross' : 'MA: Death Cross', type: up ? 'bull' : 'bear' });
    }
    if (v.RSI != null) {
      const r = v.RSI;
      chips.push({ label: r > 50 ? 'RSI Bullish' : 'RSI Bearish', type: r>50 ? 'bull' : 'bear' });
    }
    if (v.MACD != null && v.MACD_Signal != null) {
      const up = v.MACD > v.MACD_Signal;
      chips.push({ label: up ? 'MACD Bullish' : 'MACD Bearish', type: up ? 'bull' : 'bear' });
    }
    if (t.price != null && v.Bollinger_High != null && v.Bollinger_Low != null) {
      const inside = t.price < v.Bollinger_High && t.price > v.Bollinger_Low;
      const type = inside ? 'neutral' : (t.price >= v.Bollinger_High ? 'bear' : 'bull');
      chips.push({ label: inside ? 'Inside BB' : (t.price >= v.Bollinger_High ? 'Touch Upper BB' : 'Touch Lower BB'), type });
    }
    return chips;
  }, [signalTech]);

  return (
    <Main>
      <Header>Market Trend Analysis</Header>
      <Box>
        {/* ส่วนหัว + ฟิลเตอร์ (พื้นหลังแบบ SIGNAL) */}
        <TopSection>
          <H3>Technical Indicator Analysis</H3>
          <Row>
            <Label>Select Market:&nbsp;</Label>
            <Select value={country} onChange={e => setCountry(e.target.value)}>
              <option value="TH">Thailand (TH)</option>
              <option value="USA">United States (USA)</option>
            </Select>

            <Label> Select Stock:&nbsp;</Label>
            <Select value={stockSymbol} onChange={e => setStockSymbol(e.target.value)}>
              {symbolList.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
            </Select>

            <Label> Timeframe:&nbsp;</Label>
            <Select value={timeframe} onChange={e => setTimeframe(e.target.value)}>
              {Object.keys(TIMEFRAME_TO_LIMIT).map(k => <option key={k} value={k}>{k}</option>)}
            </Select>
          </Row>
        </TopSection>

        {errorText && <p style={{color:THEME.bearish}}>{errorText}</p>}
        {isLoading && <p style={{color:THEME.textMuted}}>Loading…</p>}

        {/* LATEST SIGNAL (GLOBAL) */}
        {signalTech && (
          <>
            <SignalWrap>
              <Label>LATEST SIGNAL</Label>

              <SignalMainRow>
                <BigSignal s={signalTech.signal}>{signalTech.signal}</BigSignal>
                <PriceBadge>
                  <PriceLabel>Signal Price</PriceLabel>
                  <PriceValue>{formatMoneyByMarket(signalTech.price, market)}</PriceValue>
                </PriceBadge>
              </SignalMainRow>

              <ChipRow>
                {snapshotChips.map((c, i) => (
                  <Chip key={i} type={c.type}>{c.label}</Chip>
                ))}
              </ChipRow>

              <p style={{marginTop:8, lineHeight:1.5}}>
                <b>Reason:</b>{' '}
                {(signalTech.reasons?.length
                  ? signalTech.reasons.slice(0,5).join(' • ')
                  : 'สภาวะยังไม่ชัดเจน (คะแนนกลาง ๆ)')}
              </p>
            </SignalWrap>

            {/* Core Indicators (WINDOW) */}
            <H3 style={{marginTop:18}}>
              Core Indicators <span style={{color:THEME.textMuted, fontSize:12}}>— based on selected timeframe window</span>
            </H3>
            {cardTech ? (
              <Grid>
                {/* MAs */}
                <Card color={accent(
                  cardTech.indicators.SMA_50 != null && cardTech.indicators.SMA_200 != null
                    ? (cardTech.indicators.SMA_50 > cardTech.indicators.SMA_200 ? THEME.bullish : THEME.bearish)
                    : THEME.neutral
                )}>
                  <Title>Moving Averages (SMA/EMA)</Title>
                  <Val>
                    SMA 50: {cardTech.indicators.SMA_50 != null ? cardTech.indicators.SMA_50.toFixed(2) : '—'}<br/>
                    SMA 200: {cardTech.indicators.SMA_200 != null ? cardTech.indicators.SMA_200.toFixed(2) : '—'}<br/>
                    EMA 10: {cardTech.indicators.EMA_10 != null ? cardTech.indicators.EMA_10.toFixed(2) : '—'} &nbsp;|&nbsp;
                    EMA 20: {cardTech.indicators.EMA_20 != null ? cardTech.indicators.EMA_20.toFixed(2) : '—'}
                  </Val>
                  <SigText color={accent(
                    cardTech.indicators.SMA_50 != null && cardTech.indicators.SMA_200 != null
                      ? (cardTech.indicators.SMA_50 > cardTech.indicators.SMA_200 ? THEME.bullish : THEME.bearish)
                      : THEME.neutral
                  )}>
                    {cardTech.indicators.SMA_50 != null && cardTech.indicators.SMA_200 != null
                      ? (cardTech.indicators.SMA_50 > cardTech.indicators.SMA_200 ? 'Golden Cross (Uptrend Bias)' : 'Death Cross (Downtrend Bias)')
                      : 'Insufficient bars in window'}
                  </SigText>
                </Card>

                {/* RSI */}
                <Card color={accent(
                  cardTech.indicators.RSI != null
                    ? (cardTech.indicators.RSI >= 70 ? THEME.bearish
                      : cardTech.indicators.RSI <= 30 ? THEME.bullish
                      : cardTech.indicators.RSI > 50 ? THEME.bullish : THEME.bearish)
                    : THEME.neutral
                )}>
                  <Title>RSI (14)</Title>
                  <Val style={{fontSize:22}}>{cardTech.indicators.RSI != null ? cardTech.indicators.RSI.toFixed(2) : '—'}</Val>
                  <SigText color={accent(
                    cardTech.indicators.RSI != null
                      ? (cardTech.indicators.RSI >= 70 ? THEME.bearish
                        : cardTech.indicators.RSI <= 30 ? THEME.bullish
                        : cardTech.indicators.RSI > 50 ? THEME.bullish : THEME.bearish)
                      : THEME.neutral
                  )}>
                    {cardTech.indicators.RSI == null ? 'Insufficient bars in window' :
                      cardTech.indicators.RSI >= 70 ? 'Overbought' :
                      cardTech.indicators.RSI <= 30 ? 'Oversold' :
                      cardTech.indicators.RSI > 50 ? 'Bullish Momentum' : 'Bearish Momentum'}
                  </SigText>
                </Card>

                {/* MACD */}
                <Card color={accent(
                  cardTech.indicators.MACD != null && cardTech.indicators.MACD_Signal != null
                    ? (cardTech.indicators.MACD > cardTech.indicators.MACD_Signal ? THEME.bullish : THEME.bearish)
                    : THEME.neutral
                )}>
                  <Title>MACD (12,26,9)</Title>
                  <Val>
                    MACD: {cardTech.indicators.MACD != null ? cardTech.indicators.MACD.toFixed(4) : '—'}<br/>
                    Signal: {cardTech.indicators.MACD_Signal != null ? cardTech.indicators.MACD_Signal.toFixed(4) : '—'}
                  </Val>
                  <SigText color={accent(
                    cardTech.indicators.MACD != null && cardTech.indicators.MACD_Signal != null
                      ? (cardTech.indicators.MACD > cardTech.indicators.MACD_Signal ? THEME.bullish : THEME.bearish)
                      : THEME.neutral
                  )}>
                    {cardTech.indicators.MACD != null && cardTech.indicators.MACD_Signal != null
                      ? (cardTech.indicators.MACD > cardTech.indicators.MACD_Signal ? 'Bullish Crossover' : 'Bearish Crossover')
                      : 'Insufficient bars in window'}
                  </SigText>
                </Card>

                {/* Bollinger */}
                <Card color={accent(
                  cardTech.price != null && cardTech.indicators.Bollinger_High != null && cardTech.indicators.Bollinger_Low != null
                    ? (cardTech.price >= cardTech.indicators.Bollinger_High ? THEME.bearish
                      : cardTech.price <= cardTech.indicators.Bollinger_Low ? THEME.bullish
                      : THEME.neutral)
                    : THEME.neutral
                )}>
                  <Title>Bollinger Bands (20,2)</Title>
                  <Val>
                    Upper: {cardTech.indicators.Bollinger_High != null ? cardTech.indicators.Bollinger_High.toFixed(2) : '—'}<br/>
                    Middle: {cardTech.indicators.Bollinger_Middle != null ? cardTech.indicators.Bollinger_Middle.toFixed(2) : '—'}<br/>
                    Lower: {cardTech.indicators.Bollinger_Low != null ? cardTech.indicators.Bollinger_Low.toFixed(2) : '—'}
                  </Val>
                  <SigText color={accent(
                    cardTech.price != null && cardTech.indicators.Bollinger_High != null && cardTech.indicators.Bollinger_Low != null
                      ? (cardTech.price >= cardTech.indicators.Bollinger_High ? THEME.bearish
                        : cardTech.price <= cardTech.indicators.Bollinger_Low ? THEME.bullish
                        : THEME.neutral)
                      : THEME.neutral
                  )}>
                    {cardTech.price != null && cardTech.indicators.Bollinger_High != null && cardTech.indicators.Bollinger_Low != null
                      ? (cardTech.price >= cardTech.indicators.Bollinger_High ? 'Price at/above Upper Band'
                        : cardTech.price <= cardTech.indicators.Bollinger_Low ? 'Price at/below Lower Band'
                        : 'Price inside Bands')
                      : 'Insufficient bars in window'}
                  </SigText>
                </Card>
              </Grid>
            ) : (
              <p style={{color:THEME.textMuted}}>ยังไม่มีข้อมูลพอสำหรับ timeframe นี้</p>
            )}

            {/* Advanced Indicators (WINDOW) */}
            <Toggle onClick={() => setShowAdvanced(s => !s)}>
              {showAdvanced ? 'Hide Advanced Indicators' : 'Show Advanced Indicators'}
            </Toggle>

            {showAdvanced && cardTech && (
              <>
                <H3 style={{marginTop:14}}>
                  Advanced Indicators <span style={{color:THEME.textMuted, fontSize:12}}>— based on selected timeframe window</span>
                </H3>
                <Grid>
                  <Card color={THEME.brand}>
                    <Title>ATR (14)</Title>
                    <Val>ATR: {cardTech.indicators.ATR != null ? cardTech.indicators.ATR.toFixed(4) : '—'}</Val>
                    <SigText>Average True Range</SigText>
                  </Card>

                  <Card color={THEME.brand}>
                    <Title>Keltner Channel</Title>
                    <Val>
                      High: {cardTech.indicators.Keltner_High != null ? cardTech.indicators.Keltner_High.toFixed(2) : '—'}<br/>
                      Middle: {cardTech.indicators.Keltner_Middle != null ? cardTech.indicators.Keltner_Middle.toFixed(2) : '—'}<br/>
                      Low: {cardTech.indicators.Keltner_Low != null ? cardTech.indicators.Keltner_Low.toFixed(2) : '—'}
                    </Val>
                    <SigText>EMA(typical,20) ± 2×ATR(10)</SigText>
                  </Card>

                  <Card color={THEME.brand}>
                    <Title>Chaikin Volatility</Title>
                    <Val>{cardTech.indicators.Chaikin_Vol != null ? `${cardTech.indicators.Chaikin_Vol.toFixed(2)}%` : '—'}</Val>
                    <SigText>ROC(10) of EMA(High−Low,10)</SigText>
                  </Card>

                  <Card color={THEME.brand}>
                    <Title>Donchian Channel (20)</Title>
                    <Val>
                      Upper: {cardTech.indicators.Donchian_High != null ? cardTech.indicators.Donchian_High.toFixed(2) : '—'}<br/>
                      Lower: {cardTech.indicators.Donchian_Low != null ? cardTech.indicators.Donchian_Low.toFixed(2) : '—'}
                    </Val>
                    <SigText>20-bar Highest / Lowest</SigText>
                  </Card>

                  <Card color={THEME.brand}>
                    <Title>Parabolic SAR</Title>
                    <Val>PSAR: {cardTech.indicators.PSAR != null ? cardTech.indicators.PSAR.toFixed(2) : '—'}</Val>
                    <SigText>step 0.02, max 0.2</SigText>
                  </Card>
                </Grid>
              </>
            )}
          </>
        )}

        {!signalTech && <p style={{color:THEME.textMuted}}>Loading technical data…</p>}
      </Box>
    </Main>
  );
}
