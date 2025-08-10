import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceDot } from 'recharts';

// --- Reusable Chart Component ---
const OverviewChart = ({ data, dataKey, market, timeframe }) => {

  // ฟังก์ชันสำหรับจัดรูปแบบวันที่บนแกน X
  const formatDateTick = (tick) => {
    const date = new Date(tick);
    if (timeframe === '5D' || timeframe === '1M') {
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
    if (timeframe === '3M' || timeframe === '6M' || timeframe === '1Y' || timeframe === 'ALL') {
      // สำหรับช่วงยาวๆ ให้แสดงแค่ชื่อเดือนย่อๆ ก็พอ
      return date.toLocaleDateString('en-GB', { month: 'short' });
    }
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'short' });
  };

  // ฟังก์ชันสำหรับจัดรูปแบบราคาบนแกน Y และใน Tooltip
  const formatPriceTick = (tick) => {
    if (typeof tick !== 'number') return tick;
    return `${tick.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  // --- UPDATED: Logic for calculating tick interval ---
  const getInterval = () => {
    const len = data.length;
    if (!len) return 'preserveStartEnd';
    if (len <= 35) return 'preserveStartEnd'; // แสดงทั้งหมดถ้าข้อมูลประมาณ 1 เดือน
    // สำหรับช่วงที่ยาวขึ้น ให้คำนวณเพื่อให้มีป้ายกำกับประมาณ 10-12 จุด
    return Math.floor(len / 12); 
  };

  const lastDataPoint = data && data.length > 0 ? data[data.length - 1] : null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        
        <XAxis
          dataKey="date"
          type="category"
          stroke="#a0a0a0"
          tickFormatter={formatDateTick}
          dy={5}
          interval={getInterval()}
        />

        <YAxis
          stroke="#a0a0a0"
          tickFormatter={formatPriceTick}
          domain={['auto', 'auto']}
          dx={-5}
        />
        <Tooltip 
          isAnimationActive={false}
          contentStyle={{ 
            backgroundColor: '#2a2a2a', 
            border: '1px solid #444',
            color: '#e0e0e0'
          }} 
          labelFormatter={(label) => new Date(label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
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
        
        {lastDataPoint && (
          <ReferenceDot
            x={lastDataPoint.date}
            y={lastDataPoint.ClosePrice}
            r={5}
            fill="#ff8c00"
            stroke="white"
            strokeWidth={2}
            isFront={true}
          />
        )}

        {/* --- REMOVED BRUSH COMPONENT --- */}
        
      </LineChart>
    </ResponsiveContainer>
  );
};

export default OverviewChart;
