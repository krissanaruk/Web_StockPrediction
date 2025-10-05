// src/pages/OverviewDashboard.js
import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

/* ============================== CONFIG ============================== */
const API_BASE = 'http://localhost:3000/api';
const COUNTRY_TO_MARKET = { TH: 'Thailand', USA: 'America' };

// ค่าเริ่มต้น: USA + ALL (time window) และโหมด Industry เท่านั้น
const DEFAULT_COUNTRY = 'USA';
const DEFAULT_TIME_WINDOW = 'ALL';

const TIME_WINDOWS = [
  { key: '5D', label: '5D', limit: 6 },
  { key: '1M', label: '1M', limit: 22 },
  { key: '3M', label: '3M', limit: 66 },
  { key: '6M', label: '6M', limit: 132 },
  { key: '1Y', label: '1Y', limit: 264 },
  { key: 'ALL', label: 'ALL', limit: 520 },
];

const SERIES_COLORS = [
  '#f59e0b', '#0ea5e9', '#10b981', '#a78bfa', '#ef4444', '#22c55e',
  '#eab308', '#3b82f6', '#f97316', '#8b5cf6'
];

// จำกัดภาระฝั่ง client
const MAX_SYMBOLS_PER_GROUP = 12; // หุ้นต่อ 1 กลุ่มสูงสุด
const MAX_GROUPS_TO_SHOW = 8;     // จำนวนกลุ่มสูงสุดที่วาดพร้อมกัน

const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

/* ============================== UTILS ============================== */
const formatNumber = (value, digits = 2) =>
  (value == null || Number.isNaN(value) ? '—' : Number(value).toFixed(digits));

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
};

// จับคู่ Industry เป็น bucket ที่เราต้องการโชว์ (แก้/เพิ่มเงื่อนไขได้)
function mapIndustryToBucket(industry) {
  const s = (industry || '').toLowerCase();
  if (/semiconductor/.test(s)) return 'Semiconductors';
  if (/social\s+media|social\s+network/.test(s)) return 'Social Media';
  if (/e-?commerce|internet\s+retail|online\s+retail/.test(s)) return 'E-Commerce';
  if (/internet\s+services|internet\s+content|web\s+portal|online\s+services/.test(s)) return 'Internet Services';
  if (/software/.test(s)) return 'Software';
  if (/consumer\s+electronics/.test(s)) return 'Consumer Electronics';
  if (/electric\s+vehicles?|auto.*(manufacturer|makers)/.test(s)) return 'Electric Vehicles';
  return null; // อื่น ๆ ไม่แสดง
}

// รวมซีรีส์หลายชุดให้เป็นแถวเดียวกันตาม date (สำหรับ Recharts)
const mergeSeriesByDate = (seriesMap) => {
  const index = new Map();
  Object.entries(seriesMap).forEach(([name, arr]) => {
    arr.forEach(({ date, value }) => {
      if (!index.has(date)) index.set(date, { date });
      index.get(date)[name] = value;
    });
  });
  return Array.from(index.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
};

/* ============================== STYLED ============================== */
const Page = styled.div`
  flex: 1; display: flex; flex-direction: column; gap: 16px; padding: 20px; color: #e0e0e0;
`;
const Title = styled.h1`
  margin: 0; color: #ff8c00; font-size: 28px;
`;
const Card = styled.div`
  background: #1f1f1f; border: 1px solid #2f2f2f; border-radius: 12px; padding: 16px;
`;
const HeaderRow = styled.div`
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
`;
const HeaderLeft = styled.div`
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
`;
const SubText = styled.div`
  color: #a0a0a0; font-size: 12px; margin-top: 4px;
`;
const Select = styled.select`
  padding: 8px 10px; border-radius: 8px; background: #2a2a2a; color: #eee;
  border: 1px solid #3a3a3a; font-weight: 600;
`;
const Segments = styled.div`
  display: inline-flex; padding: 4px; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 10px;
  > button {
    border: 0; background: transparent; color: #bbb; padding: 6px 10px; border-radius: 8px; font-weight: 700; cursor: pointer;
  }
  > button.active { background: #ff8c00; color: #111; }
`;
const StaticPill = styled.span`
  padding: 8px 10px; border-radius: 8px; background: #2a2a2a; border: 1px solid #3a3a3a;
  color: #ccc; font-weight: 700; user-select: none;
`;

/* ============================== COMPONENT ============================== */
export default function OverviewDashboard() {
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [selectedTimeWindowKey, setSelectedTimeWindowKey] = useState(DEFAULT_TIME_WINDOW);

  // metadata ที่อย่างน้อยต้องมี { StockSymbol, Industry }
  const [stockMetaList, setStockMetaList] = useState([]);
  // แถวข้อมูลสำหรับกราฟ (merged ตามวัน)
  const [chartRows, setChartRows] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const selectedMarket = COUNTRY_TO_MARKET[selectedCountry];
  const selectedTimeWindowConfig =
    TIME_WINDOWS.find(w => w.key === selectedTimeWindowKey) || TIME_WINDOWS[TIME_WINDOWS.length - 1];

  // โหลด metadata (ต้องมี Industry)
  useEffect(() => {
    (async () => {
      try {
        setErrorMessage('');
        const { data } = await axios.get(
          `${API_BASE}/stocks/meta?market=${encodeURIComponent(selectedMarket)}`,
          getAuthHeaders()
        );
        setStockMetaList(Array.isArray(data?.data) ? data.data : data);
      } catch {
        setStockMetaList([]);
        setErrorMessage('โหลด metadata (Industry) ไม่สำเร็จ');
      }
    })();
  }, [selectedMarket]);

  // จัดกลุ่ม Industry + ดึงราคา + เฉลี่ยแบบ Equal-Weight + Normalize = 100
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      if (!stockMetaList.length) { setChartRows([]); return; }

      try {
        setIsLoading(true);
        setErrorMessage('');

        // 1) จัดกลุ่มจาก Industry → bucket ที่เรากำหนด
        const groups = new Map(); // groupName -> symbols[]
        for (const row of stockMetaList) {
          const groupName = mapIndustryToBucket(row.Industry);
          if (!groupName) continue;
          if (!groups.has(groupName)) groups.set(groupName, []);
          const list = groups.get(groupName);
          if (list.length < MAX_SYMBOLS_PER_GROUP) list.push(row.StockSymbol);
        }

        const groupNames = Array.from(groups.keys()).slice(0, MAX_GROUPS_TO_SHOW);
        if (!groupNames.length) {
          setChartRows([]);
          setErrorMessage('ไม่พบ Industry ที่ตรงกับกลุ่มที่ตั้งค่าไว้');
          setIsLoading(false);
          return;
        }

        // 2) เตรียมดึงราคาของหุ้นทั้งหมด (unique)
        const uniqueSymbols = Array.from(new Set(groupNames.flatMap(name => groups.get(name))));
        const limit = selectedTimeWindowConfig.limit;

        const fetchSymbolSeries = async (symbol) => {
          const url = `${API_BASE}/market-trend/data?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
          const { data } = await axios.get(url, { ...getAuthHeaders(), signal: controller.signal });
          const series = (data?.series || [])
            .map(r => ({ date: r.date, close: Number(r.ClosePrice) }))
            .filter(x => Number.isFinite(x.close));
          if (!series.length) return [];
          const base = series[0].close || null;
          return base ? series.map(x => ({ date: x.date, value: (x.close / base) * 100 })) : [];
        };

        const priceBySymbol = {};
        const settled = await Promise.allSettled(uniqueSymbols.map(s => fetchSymbolSeries(s)));
        settled.forEach((res, i) => {
          if (res.status === 'fulfilled') priceBySymbol[uniqueSymbols[i]] = res.value;
        });

        // 3) รวมเป็นเส้นต่อ "กลุ่ม" แบบ equal-weight
        const groupSeries = {};
        for (const name of groupNames) {
          const members = groups.get(name) || [];

          // รวมวันที่ทั้งหมดของสมาชิก
          const dateSet = new Set();
          members.forEach(s => (priceBySymbol[s] || []).forEach(p => dateSet.add(p.date)));
          const dates = Array.from(dateSet).sort((a, b) => new Date(a) - new Date(b));

          const arr = dates.map(date => {
            let sum = 0, count = 0;
            for (const s of members) {
              const point = (priceBySymbol[s] || []).find(z => z.date === date);
              if (point && Number.isFinite(point.value)) { sum += point.value; count += 1; }
            }
            return { date, value: count ? (sum / count) : null };
          });

          groupSeries[name] = arr;
        }

        // 4) รวมเป็นแถวสำหรับ Recharts
        setChartRows(mergeSeriesByDate(groupSeries));
      } catch (e) {
        if (e.name !== 'CanceledError') setErrorMessage('โหลด/คำนวณข้อมูลกลุ่มไม่สำเร็จ');
        setChartRows([]);
      } finally {
        setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [stockMetaList, selectedTimeWindowKey, selectedTimeWindowConfig.limit]);

  const lineKeys = useMemo(() => {
    if (!chartRows.length) return [];
    const set = new Set();
    for (const row of chartRows) {
      for (const key of Object.keys(row)) if (key !== 'date') set.add(key);
    }
    return Array.from(set);
  }, [chartRows]);

  return (
    <Page>
      <Title>Dashboard Overview</Title>

      <Card>
        <HeaderRow>
          <HeaderLeft>
            <div>
              <div style={{ fontWeight: 800, color: '#ff8c00' }}>
                Price — {selectedMarket} <span style={{ color: '#aaa', fontWeight: 600 }}>(Indexed = 100)</span>
              </div>
              <SubText>โหมดนี้แสดง “ดัชนีกลุ่มอุตสาหกรรม (Industry)” แบบ Equal-Weight (ฐาน = 100 ณ จุดเริ่มต้น)</SubText>
            </div>

            <Select value={selectedCountry} onChange={e => setSelectedCountry(e.target.value)}>
              <option value="TH">Thailand (TH)</option>
              <option value="USA">United States (USA)</option>
            </Select>

            {/* ป้ายคงที่เพื่อบอกว่าใช้ Industry อย่างเดียว (ไม่ใช่ dropdown) */}
            <StaticPill>Industry</StaticPill>
          </HeaderLeft>

          <Segments>
            {TIME_WINDOWS.map(w => (
              <button
                key={w.key}
                className={w.key === selectedTimeWindowKey ? 'active' : ''}
                onClick={() => setSelectedTimeWindowKey(w.key)}
              >
                {w.label}
              </button>
            ))}
          </Segments>
        </HeaderRow>

        {errorMessage && <div style={{ color: '#ef4444', marginTop: 6 }}>{errorMessage}</div>}
        {isLoading && <div style={{ color: '#a0a0a0', marginTop: 6 }}>Loading...</div>}

        <div style={{ height: 440, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fill: '#c9c9c9' }} tickFormatter={formatDate} />
              <YAxis tick={{ fill: '#c9c9c9' }} />
              <Tooltip
                formatter={(value, name) => [formatNumber(value), name]}
                labelFormatter={(l) => `Date: ${formatDate(l)}`}
                contentStyle={{ background: '#2a2a2a', border: '1px solid #444', color: '#eee' }}
              />
              <Legend />
              {lineKeys.map((key, idx) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={key}
                  stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
              {/* ไม่มี Brush/ซูม เพื่อให้เลื่อนด้วยสกอร์ล/แกนเวลาเท่านั้น */}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </Page>
  );
}
