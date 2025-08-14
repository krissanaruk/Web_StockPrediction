import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceDot
} from 'recharts';

const OverviewChart = ({ data = [], dataKey, market, timeframe }) => {
  // สร้าง index สำหรับแกน X (เว้นระยะเท่ากันแน่นอน)
  const plotData = data.map((d, i) => ({ ...d, idx: i }));

  // แปลง label วันที่ (จาก dateLabel: 'YYYY-MM-DD')
  const formatDateLabel = (label) => {
    const [y, m, d] = label.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (['5D', '1M'].includes(timeframe)) {
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
    if (['3M', '6M', '1Y', 'ALL'].includes(timeframe)) {
      return dt.toLocaleDateString('en-GB', { month: 'short' });
    }
    return dt.toLocaleDateString('en-GB', { year: 'numeric', month: 'short' });
  };

  const formatPriceTick = (tick) =>
    typeof tick === 'number'
      ? tick.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : tick;

  const getTickCount = () => {
    const n = plotData.length;
    if (n <= 8) return n;
    if (n <= 30) return 10;
    if (n <= 90) return 12;
    return 14;
  };

  const last = plotData.length ? plotData[plotData.length - 1] : null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={plotData}
        margin={{ top: 5, right: 8, left: 10, bottom: 5 }}  // ลด margin ขวาเล็กน้อย
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />

        {/* ✅ ใช้แกนตัวเลขด้วย index เพื่อให้จุดสุดท้ายชนขอบขวาพอดี */}
        <XAxis
          dataKey="idx"
          type="number"
          domain={[0, Math.max(plotData.length - 1, 0)]}
          allowDecimals={false}
          stroke="#a0a0a0"
          tickCount={getTickCount()}
          interval="preserveStartEnd"
          // แปลงค่า idx -> label วันที่
          tickFormatter={(v) => {
            const i = Math.max(0, Math.min(plotData.length - 1, Math.round(v)));
            return formatDateLabel(plotData[i].dateLabel);
          }}
          // ไม่ต้องมี padding ปลายแกน
          padding={{ left: 0, right: 0 }}
        />

        <YAxis
          stroke="#a0a0a0"
          tickFormatter={formatPriceTick}
          domain={['auto', 'auto']}
          dx={-5}
        />

        <Tooltip
          isAnimationActive={false}
          contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #444', color: '#e0e0e0' }}
          // ใช้ timestamp จริงจาก payload เพื่อแสดงวันที่
          labelFormatter={(_, payload) => {
            const ts = payload?.[0]?.payload?.date;
            return ts
              ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
              : '';
          }}
          formatter={(value) => [formatPriceTick(value), 'Price']}
        />

        <Legend wrapperStyle={{ paddingTop: '20px' }} />

        <Line
          name={dataKey}
          type="monotone"
          dataKey="ClosePrice"
          stroke="#ff8c00"
          strokeWidth={2}
          activeDot={{ r: 8 }}
          dot={false}
        />

        {last && (
          <ReferenceDot
            x={last.idx}                 // ✅ อ้างตาม index
            y={last.ClosePrice}
            r={5}
            fill="#ff8c00"
            stroke="white"
            strokeWidth={2}
            isFront
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
};

export default OverviewChart;
