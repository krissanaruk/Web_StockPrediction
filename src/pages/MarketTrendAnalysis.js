// MarketTrend.js
import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import axios from 'axios';

/* =========================================================================
   1) CONFIG
   ========================================================================= */
const API_BASE = 'http://localhost:3000/api/market-trend';
const COUNTRY_TO_MARKET = { TH: 'Thailand', USA: 'America' };
const DEFAULT_SYMBOL_BY_COUNTRY = { TH: 'ADVANC', USA: 'AAPL' };

// ใช้ข้อมูลพอสำหรับ MA200 + mini-backtest
const SERIES_LIMIT = 320;

const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

// แสดงสกุลเงินตามตลาด (ใช้ใน UI เท่านั้น)
const CURRENCY_BY_MARKET = { Thailand: 'THB', America: 'USD' };
const formatMoney = (value, market) => {
  const currency = CURRENCY_BY_MARKET[market] || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    // เผื่อ env ไม่มี Intl currency
    return `${currency === 'THB' ? '฿' : '$'}${Number(value).toFixed(2)}`;
  }
};

/* =========================================================================
   2) SMALL HELPERS (เลข/สถิติ)
   ========================================================================= */
const toNum = (v) => (v == null ? null : Number(v));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const last = (arr) => (arr && arr.length ? arr[arr.length - 1] : null);

const percentile = (arr, p) => {
  const valid = arr.filter((x) => x != null && Number.isFinite(x));
  if (!valid.length) return null;
  const s = [...valid].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (s.length - 1));
  return s[idx];
};

const stddev = (win) => {
  if (!win || !win.length) return null;
  const mean = win.reduce((a, b) => a + b, 0) / win.length;
  const v = win.reduce((acc, x) => acc + (x - mean) ** 2, 0) / win.length;
  return Math.sqrt(v);
};

/* =========================================================================
   3) INDICATORS (SMA, EMA, RSI, MACD, BB, ATR)
   ========================================================================= */
// SMA
const sma = (arr, period) => {
  if (!arr || !arr.length) return [];
  const out = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= period) sum -= arr[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
};

// EMA
const ema = (arr, period) => {
  if (!arr || !arr.length) return [];
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

// RSI (Wilder)
const rsi = (arr, period = 14) => {
  if (!arr || arr.length < period + 1) return new Array(arr?.length || 0).fill(null);
  const out = new Array(arr.length).fill(null);
  const gains = [], losses = [];
  for (let i = 1; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < arr.length; i++) {
    const g = gains[i - 1], l = losses[i - 1];
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
};

// MACD (12,26,9)
const macdCalc = (arr, fast = 12, slow = 26, signal = 9) => {
  if (!arr || !arr.length) return { macdLine: [], signalLine: [], hist: [] };
  const eFast = ema(arr, fast);
  const eSlow = ema(arr, slow);
  const macdLine = arr.map((_, i) =>
    eFast[i] != null && eSlow[i] != null ? eFast[i] - eSlow[i] : null
  );
  const firstIdx = macdLine.findIndex((v) => v != null);
  const valid = macdLine.filter((v) => v != null);
  const sigValid = ema(valid, signal);
  const signalLine = new Array(arr.length).fill(null);
  for (let i = 0; i < sigValid.length; i++) signalLine[firstIdx + i] = sigValid[i];
  const hist = macdLine.map((v, i) => (v != null && signalLine[i] != null ? v - signalLine[i] : null));
  return { macdLine, signalLine, hist };
};

// Bollinger Bands (20, 2)
const bollinger = (arr, period = 20, k = 2) => {
  if (!arr || arr.length < period) {
    const empty = new Array(arr?.length || 0).fill(null);
    return { upper: empty, middle: empty, lower: empty, width: empty };
  }
  const middle = sma(arr, period);
  const upper = new Array(arr.length).fill(null);
  const lower = new Array(arr.length).fill(null);
  const width = new Array(arr.length).fill(null);
  for (let i = 0; i < arr.length; i++) {
    if (i >= period - 1) {
      const win = arr.slice(i - period + 1, i + 1);
      const m = middle[i];
      const sd = stddev(win);
      const up = m + k * sd;
      const lo = m - k * sd;
      upper[i] = up; lower[i] = lo;
      width[i] = (up - lo) / m;
    }
  }
  return { upper, middle, lower, width };
};

// ATR(14)
const atr = (highs, lows, closes, period = 14) => {
  if (!highs || !lows || !closes || highs.length !== lows.length || lows.length !== closes.length)
    return new Array(closes?.length || 0).fill(null);
  if (closes.length < period + 1) return new Array(closes.length).fill(null);

  const TR = new Array(closes.length).fill(null);
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    TR[i] = tr;
  }
  const out = new Array(closes.length).fill(null);
  let first = 0;
  for (let i = 1; i <= period; i++) first += TR[i] || 0;
  let val = first / period;
  out[period] = val;
  for (let i = period + 1; i < closes.length; i++) {
    val = (val * (period - 1) + TR[i]) / period;
    out[i] = val;
  }
  return out;
};

/* =========================================================================
   4) CORE CALC: สร้างอินดิเคเตอร์ทั้งหมด + คิดคะแนน + backtest
   ========================================================================= */
/** เตรียม arrays สำหรับอินดิเคเตอร์ทั้งหมดจาก series */
function buildIndicatorArrays(series) {
  const closes = series.map((d) => toNum(d.ClosePrice));
  const highs  = series.map((d) => toNum(d.HighPrice ?? d.High));
  const lows   = series.map((d) => toNum(d.LowPrice ?? d.Low));

  const ma50Arr   = sma(closes, 50);
  const ma200Arr  = sma(closes, 200);
  const rsiArr    = rsi(closes, 14);
  const macdObj   = macdCalc(closes, 12, 26, 9);
  const bb        = bollinger(closes, 20, 2);
  const atrArr    = atr(highs, lows, closes, 14);

  return { closes, highs, lows, ma50Arr, ma200Arr, rsiArr, macdObj, bb, atrArr };
}

/** คิดคะแนนรวม (Confluence) ที่ index i */
function scoreAtIndex(i, ctx) {
  const {
    closes, ma50Arr, ma200Arr, rsiArr, macdObj: { macdLine, signalLine }, bb,
  } = ctx;
  const price = closes[i];
  let reasons = [];
  let trend = 0, mom = 0, mr = 0, vol = 0;

  // Trend: gap MA50 vs MA200 + slope MA50
  if (ma50Arr[i] != null && ma200Arr[i] != null) {
    const gap = ma50Arr[i] - ma200Arr[i];
    trend += clamp(gap / (price * 0.02), -1, 1);
    if (i >= 5 && ma50Arr[i - 5] != null) {
      trend += 0.3 * clamp((ma50Arr[i] - ma50Arr[i - 5]) / (price * 0.01), -1, 1);
    }
    if (gap > 0) reasons.push('MA50 > MA200 (bias ขาขึ้น)');
    if (gap < 0) reasons.push('MA50 < MA200 (bias ขาลง)');
  }

  // Momentum: MACD vs Signal + RSI centerline
  if (macdLine[i] != null && signalLine[i] != null) {
    const mdiff = macdLine[i] - signalLine[i];
    mom += 0.7 * clamp(mdiff / (price * 0.005), -1, 1);
    if (mdiff > 0) reasons.push('MACD > Signal (โมเมนตัมบวก)');
    if (mdiff < 0) reasons.push('MACD < Signal (โมเมนตัมลบ)');
  }
  if (rsiArr[i] != null) {
    mom += 0.3 * clamp((rsiArr[i] - 50) / 50, -1, 1);
    if (rsiArr[i] > 55) reasons.push('RSI > 50 (แรงซื้อเด่น)');
    if (rsiArr[i] < 45) reasons.push('RSI < 50 (แรงขายเด่น)');
  }

  // Mean Reversion: BB touch + RSI extreme
  if (bb.upper[i] != null && bb.lower[i] != null && price != null) {
    if (price <= bb.lower[i]) { mr += 0.8; reasons.push('ราคาชน/ต่ำกว่า Lower Band'); }
    if (price >= bb.upper[i]) { mr -= 0.8; reasons.push('ราคาชน/เหนือกว่า Upper Band'); }
  }
  if (rsiArr[i] != null) {
    if (rsiArr[i] <= 30) { mr += 0.6; reasons.push('RSI Oversold'); }
    if (rsiArr[i] >= 70) { mr -= 0.6; reasons.push('RSI Overbought'); }
  }

  // Volatility/Squeeze: BB width ต่ำ + ใช้ทิศ MACD
  if (i >= 60 && bb.width[i] != null) {
    const wnd = bb.width.slice(i - 59, i + 1).filter(v => v != null);
    const p20 = percentile(wnd, 20);
    if (p20 != null && bb.width[i] <= p20) {
      const md = (ctx.macdObj.macdLine[i] ?? 0) - (ctx.macdObj.signalLine[i] ?? 0);
      vol += 0.3 * sign(md);
      reasons.push('Volatility squeeze (BB แคบ)');
    }
  }

  const W_TREND = 0.4, W_MOM = 0.3, W_MR = 0.2, W_VOL = 0.1;
  const score =
    W_TREND * clamp(trend, -1, 1) +
    W_MOM   * clamp(mom,   -1, 1) +
    W_MR    * clamp(mr,    -1, 1) +
    W_VOL   * clamp(vol,   -1, 1);

  return { score, reasons };
}

/** mini-backtest: นับสัญญาณย้อนหลังแล้วดูอีก lookahead แท่ง */
function miniBacktest(ctx, lookahead = 5, BUY_TH = 0.35, SELL_TH = -0.35) {
  const { closes, ma200Arr, macdObj, bb, rsiArr } = ctx;
  if (!closes || closes.length < 220) return { effectiveness: 0, hits: 0, total: 0, lookahead };

  const start = Math.max(
    200,            // MA200 พร้อม
    26 + 9,        // MACD+Signal พร้อม
    20 + 1,        // Bollinger พร้อม
    14 + 1         // RSI พร้อม
  );

  let hits = 0, total = 0;
  for (let t = start; t < closes.length - lookahead; t++) {
    // ข้ามจุดที่ข้อมูลยังไม่พร้อม
    if (ma200Arr[t] == null || macdObj.signalLine[t] == null || bb.middle[t] == null || rsiArr[t] == null) {
      continue;
    }
    const { score } = scoreAtIndex(t, ctx);
    const sig = score >= BUY_TH ? 'BUY' : score <= SELL_TH ? 'SELL' : 'HOLD';
    if (sig === 'HOLD') continue;

    total++;
    const pv = closes[t];
    const fv = closes[t + lookahead];
    if (pv == null || fv == null) continue;
    const ok = sig === 'BUY' ? fv > pv : fv < pv;
    if (ok) hits++;
  }
  const effectiveness = total ? Math.round((hits / total) * 100) : 0;
  return { effectiveness, hits, total, lookahead };
}

/** รวบยอด: คำนวณทุกอย่างสำหรับ UI */
function computeTechnical(series) {
  if (!series || !series.length) return null;

  const ctx = buildIndicatorArrays(series);
  const i = ctx.closes.length - 1;
  const price = ctx.closes[i];

  // อินดิเคเตอร์ ณ จุดล่าสุด
  const ma50  = ctx.ma50Arr[i] ?? null;
  const ma200 = ctx.ma200Arr[i] ?? null;
  const rsiV  = ctx.rsiArr[i] ?? null;
  const macdV = ctx.macdObj.macdLine[i] ?? null;
  const macdS = ctx.macdObj.signalLine[i] ?? null;
  const bbUp  = ctx.bb.upper[i] ?? null;
  const bbMd  = ctx.bb.middle[i] ?? null;
  const bbLo  = ctx.bb.lower[i] ?? null;

  // คะแนนรวม + เหตุผล
  const { score, reasons } = scoreAtIndex(i, ctx);
  const BUY_TH = 0.35, SELL_TH = -0.35;

  let latestSignal = 'HOLD';
  if (score >= BUY_TH) latestSignal = 'BUY';
  else if (score <= SELL_TH) latestSignal = 'SELL';

  // ความเชื่อมั่น: ตาม |score| และจำนวนอินดิเคเตอร์ที่พร้อม
  const parts =
    (ma50 != null && ma200 != null ? 1 : 0) +
    (macdV != null && macdS != null ? 1 : 0) +
    (rsiV != null ? 1 : 0) +
    (bbUp != null && bbLo != null ? 1 : 0);
  const coverage = parts / 4;
  const confidence = clamp(Math.abs(score) * (0.6 + 0.4 * coverage), 0, 1);

  // mini-backtest
  const bt = miniBacktest(ctx, 5, BUY_TH, SELL_TH);

  return {
    ma: {
      ma50, ma200,
      signal:
        ma50 != null && ma200 != null
          ? (ma50 > ma200 ? 'Golden Cross (Uptrend Bias)' : 'Death Cross (Downtrend Bias)')
          : 'Neutral',
      color:
        ma50 != null && ma200 != null
          ? (ma50 > ma200 ? '#28a745' : '#dc3545')
          : '#6c757d',
    },
    rsi: {
      value: rsiV,
      signal:
        rsiV == null ? 'Neutral'
        : rsiV >= 70 ? 'Overbought'
        : rsiV <= 30 ? 'Oversold'
        : rsiV > 50 ? 'Bullish Momentum' : 'Bearish Momentum',
      color:
        rsiV == null ? '#6c757d'
        : rsiV >= 70 ? '#dc3545'
        : rsiV <= 30 ? '#28a745'
        : rsiV > 50 ? '#28a745' : '#dc3545',
    },
    macd: {
      value: macdV,
      signalLine: macdS,
      text:
        macdV != null && macdS != null
          ? (macdV > macdS ? 'Bullish Crossover' : 'Bearish Crossover')
          : 'Neutral',
      color:
        macdV != null && macdS != null
          ? (macdV > macdS ? '#28a745' : '#dc3545')
          : '#6c757d',
    },
    bb: {
      upper: bbUp, middle: bbMd, lower: bbLo,
      text:
        price != null && bbUp != null && bbLo != null
          ? (price >= bbUp ? 'Price at/above Upper Band'
            : price <= bbLo ? 'Price at/below Lower Band'
            : 'Price near Middle Band')
          : 'Price near Middle Band',
      color:
        price != null && bbUp != null && bbLo != null
          ? (price >= bbUp ? '#dc3545'
            : price <= bbLo ? '#28a745'
            : '#6c757d')
          : '#6c757d',
    },
    strategy: {
      latestSignal,
      score,
      confidence,                    // 0..1
      signalPrice: price ?? null,
      reason:
        latestSignal === 'HOLD'
          ? 'สภาวะยังไม่ชัดเจน (คะแนนกลาง ๆ)'
          : reasons.slice(0, 3).join(' • '),
      effectiveness: bt.effectiveness,
      hits: bt.hits,
      total: bt.total,
      lookahead: bt.lookahead,
    },
  };
}

/* =========================================================================
   5) UI (คงดีไซน์เดิม)
   ========================================================================= */
const MainContent = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center;
  overflow-y: auto; padding: 20px; color: #e0e0e0;
`;
const Header = styled.header`
  width: 100%; background: #ff8c00; padding: 15px; text-align: center; color: white;
  font-size: 28px; font-weight: bold; box-shadow: 0 4px 8px rgba(255,140,0,0.4);
  border-radius: 10px; margin-bottom: 20px;
`;
const AnalysisContainer = styled.div`
  background: #1e1e1e; padding: 25px; border-radius: 12px; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
  border: 1px solid #333; width: 100%; max-width: 1400px;
`;
const CardTitle = styled.h3`
  color: #ff8c00; margin: 0 0 20px 0; font-size: 22px; border-bottom: 2px solid #ff8c00; padding-bottom: 10px;
`;
const SelectorContainer = styled.div` margin-bottom: 20px; display: flex; align-items: center; gap: 15px; `;
const StockSelector = styled.select`
  padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.3);
  outline: none; background: #333; color: white; font-size: 16px; font-weight: bold;
`;
const IndicatorGrid = styled.div` display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; `;
const IndicatorCard = styled.div`
  background: #2a2a2a; padding: 20px; border-radius: 10px; border-left: 5px solid ${p => p.color || '#ff8c00'};
`;
const IndicatorTitle = styled.h4` margin: 0 0 10px 0; font-size: 18px; color: #e0e0e0; `;
const IndicatorValue = styled.p` font-size: 24px; font-weight: bold; margin: 0 0 5px 0; color: #ff8c00; `;
const IndicatorSignal = styled.p` font-size: 14px; margin: 0; font-weight: bold; color: ${p => p.color || '#a0a0a0'}; `;
const StrategyCard = styled.div`
  background: linear-gradient(45deg, #2a2a2a, #333); padding: 25px; border-radius: 12px; margin-top: 20px;
  display: flex; justify-content: space-around; align-items: center; flex-wrap: wrap; gap: 20px;
`;
const SignalDisplay = styled.div` text-align: center; `;
const SignalLabel = styled.p` margin: 0; font-size: 18px; color: #a0a0a0; text-transform: uppercase; `;
const SignalValue = styled.p`
  margin: 5px 0 0 0; font-size: 48px; font-weight: bold;
  color: ${p => (p.signal === 'BUY' ? '#28a745' : p.signal === 'SELL' ? '#dc3545' : '#6c757d')};
`;
const StrategyDetails = styled.div` flex: 1; min-width: 300px; `;
const DetailItem = styled.p` margin: 8px 0; font-size: 16px; strong { color: #ff8c00; margin-right: 8px; }`;

/* =========================================================================
   6) COMPONENT
   ========================================================================= */
function MarketTrendAnalysis() {
  const [selectedCountry, setSelectedCountry] = useState('TH');
  const [selectedStock, setSelectedStock] = useState(DEFAULT_SYMBOL_BY_COUNTRY['TH']);

  const [symbols, setSymbols] = useState([]); // [{symbol,name}]
  const [series, setSeries] = useState([]);   // [{date, OpenPrice, HighPrice, LowPrice, ClosePrice, Volume}]
  const [latest, setLatest] = useState(null); // {Date, ClosePrice,...}

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  /* ---- โหลดรายชื่อหุ้นตามตลาด ---- */
  useEffect(() => {
    const run = async () => {
      try {
        setErr('');
        const market = COUNTRY_TO_MARKET[selectedCountry];
        const url = `${API_BASE}/symbols?market=${encodeURIComponent(market)}`;
        const { data } = await axios.get(url, getAuthHeaders());
        const list = (data?.data || []).map((r) => ({
          symbol: r.StockSymbol,
          name: r.CompanyName || r.StockSymbol,
        }));
        setSymbols(list);

        // ตั้ง symbol ตั้งต้นให้เหมาะกับประเทศ
        const def = DEFAULT_SYMBOL_BY_COUNTRY[selectedCountry];
        setSelectedStock(def || (list[0]?.symbol || ''));
      } catch (e) {
        console.error(e);
        setErr(e?.response?.data?.error || 'โหลดรายชื่อหุ้นไม่สำเร็จ');
        setSymbols([]);
        setSelectedStock('');
      }
    };
    run();
  }, [selectedCountry]);

  /* ---- โหลด series + latest เมื่อเลือกหุ้น ---- */
  useEffect(() => {
    if (!selectedStock) return;
    const controller = new AbortController(); // ยกเลิกคำขอเก่าถ้ามีการสลับเร็ว ๆ
    (async () => {
      try {
        setLoading(true); setErr('');
        const url = `${API_BASE}/data?symbol=${encodeURIComponent(selectedStock)}&limit=${SERIES_LIMIT}`;
        const { data } = await axios.get(url, { ...getAuthHeaders(), signal: controller.signal });
        setSeries(data?.series || []);
        setLatest(data?.latest || null);
      } catch (e) {
        if (e.name === 'CanceledError') return;
        console.error(e);
        setErr(e?.response?.data?.error || 'โหลดข้อมูลหุ้นไม่สำเร็จ');
        setSeries([]); setLatest(null);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [selectedStock]);

  /* ---- คำนวณอินดิเคเตอร์ + สัญญาณ ---- */
  const technical = useMemo(() => computeTechnical(series), [series]);

  /* ---- UI ---- */
  const availableStocks = useMemo(() => symbols.map((s) => s.symbol), [symbols]);
  const marketName = COUNTRY_TO_MARKET[selectedCountry];

  return (
    <MainContent>
      <Header>Market Trend Analysis</Header>
      <AnalysisContainer>
        <CardTitle>Technical Indicator Analysis</CardTitle>

        <SelectorContainer>
          <label htmlFor="country-select" style={{ fontWeight: 'bold' }}>Select Market:</label>
          <StockSelector
            id="country-select"
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
          >
            <option value="TH">Thailand (TH)</option>
            <option value="USA">United States (USA)</option>
          </StockSelector>

          <label htmlFor="stock-select" style={{ fontWeight: 'bold' }}>Select Stock:</label>
          <StockSelector
            id="stock-select"
            value={selectedStock}
            onChange={(e) => setSelectedStock(e.target.value)}
          >
            {availableStocks.map((sym) => (
              <option key={sym} value={sym}>{sym}</option>
            ))}
          </StockSelector>
        </SelectorContainer>

        {err && <p style={{ color: '#dc3545', marginBottom: 12 }}>{err}</p>}
        {loading && <p style={{ color: '#a0a0a0' }}>Loading technical data...</p>}

        {technical ? (
          <>
            <IndicatorGrid>
              <IndicatorCard color={technical.ma.color}>
                <IndicatorTitle>Moving Averages (MA)</IndicatorTitle>
                <IndicatorValue>
                  {`MA50: ${technical.ma.ma50 != null ? technical.ma.ma50.toFixed(2) : '-'}`}<br />
                  {`MA200: ${technical.ma.ma200 != null ? technical.ma.ma200.toFixed(2) : '-'}`}
                </IndicatorValue>
                <IndicatorSignal color={technical.ma.color}>{technical.ma.signal}</IndicatorSignal>
              </IndicatorCard>

              <IndicatorCard color={technical.rsi.color}>
                <IndicatorTitle>RSI (14)</IndicatorTitle>
                <IndicatorValue>{technical.rsi.value != null ? technical.rsi.value.toFixed(2) : '-'}</IndicatorValue>
                <IndicatorSignal color={technical.rsi.color}>{technical.rsi.signal}</IndicatorSignal>
              </IndicatorCard>

              <IndicatorCard color={technical.macd.color}>
                <IndicatorTitle>MACD</IndicatorTitle>
                <IndicatorValue>
                  {`MACD: ${technical.macd.value != null ? technical.macd.value.toFixed(4) : '-'}`}<br />
                  {`Signal: ${technical.macd.signalLine != null ? technical.macd.signalLine.toFixed(4) : '-'}`}
                </IndicatorValue>
                <IndicatorSignal color={technical.macd.color}>{technical.macd.text}</IndicatorSignal>
              </IndicatorCard>

              <IndicatorCard color={technical.bb.color}>
                <IndicatorTitle>Bollinger Bands</IndicatorTitle>
                <IndicatorValue>
                  {`Upper: ${technical.bb.upper != null ? technical.bb.upper.toFixed(2) : '-'}`}<br />
                  {`Middle: ${technical.bb.middle != null ? technical.bb.middle.toFixed(2) : '-'}`}<br />
                  {`Lower: ${technical.bb.lower != null ? technical.bb.lower.toFixed(2) : '-'}`}
                </IndicatorValue>
                <IndicatorSignal color={technical.bb.color}>{technical.bb.text}</IndicatorSignal>
              </IndicatorCard>
            </IndicatorGrid>

            <CardTitle style={{ marginTop: '40px' }}>Strategy & Signals</CardTitle>
            <StrategyCard>
              <SignalDisplay>
                <SignalLabel>LATEST SIGNAL</SignalLabel>
                <SignalValue signal={technical.strategy.latestSignal}>
                  {technical.strategy.latestSignal}
                </SignalValue>
              </SignalDisplay>

              <StrategyDetails>
                <DetailItem>
                  <strong>Reason:</strong>
                  <span>{technical.strategy.reason}</span>
                </DetailItem>
                <DetailItem>
                  <strong>Signal Price:</strong>
                  <span>
                    {technical.strategy.signalPrice != null
                      ? formatMoney(technical.strategy.signalPrice, marketName)
                      : 'N/A'}
                  </span>
                </DetailItem>
                <DetailItem>
                  <strong>Confidence:</strong>
                  <span>{Math.round(technical.strategy.confidence * 100)}%</span>
                </DetailItem>
                <DetailItem>
                  <strong>Strategy Effectiveness (mini-backtest):</strong>
                  <span>
                    {technical.strategy.effectiveness}%{technical.strategy.total
                      ? ` (hits ${technical.strategy.hits}/${technical.strategy.total}, lookahead ${technical.strategy.lookahead})`
                      : ''}
                  </span>
                </DetailItem>
              </StrategyDetails>
            </StrategyCard>
          </>
        ) : (
          <p style={{ color: '#a0a0a0' }}>Loading technical data...</p>
        )}
      </AnalysisContainer>
    </MainContent>
  );
}

export default MarketTrendAnalysis;
