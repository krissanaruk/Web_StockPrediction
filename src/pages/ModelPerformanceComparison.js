import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
// import axios from 'axios'; // สำหรับการเชื่อมต่อ API จริง

// --- Mock Data ---
const mockModelPerformance = [
  {
    id: 1,
    name: 'AlphaBot v2.1',
    accuracy: 78.5,
    winLossRatio: '152/43',
    avgProfit: 15.78,
    totalTrades: 195,
    primaryStock: 'AAPL',
    trendAnalysis: { actual: 'Upward', predicted: 'Upward', match: true }
  },
  {
    id: 2,
    name: 'BetaTrade X',
    accuracy: 72.1,
    winLossRatio: '98/38',
    avgProfit: 9.23,
    totalTrades: 136,
    primaryStock: 'MSFT',
    trendAnalysis: { actual: 'Sideways', predicted: 'Upward', match: false }
  },
  {
    id: 3,
    name: 'GammaWave 1.5',
    accuracy: 65.8,
    winLossRatio: '110/58',
    avgProfit: -2.50,
    totalTrades: 168,
    primaryStock: 'AMZN',
    trendAnalysis: { actual: 'Downward', predicted: 'Downward', match: true }
  },
];

// --- Styled Components ---
const MainContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  padding: 20px;
  color: #e0e0e0;
`;

const Header = styled.header`
  width: 100%;
  background: #ff8c00;
  padding: 15px;
  text-align: center;
  color: white;
  font-size: 28px;
  font-weight: bold;
  box-shadow: 0 4px 8px rgba(255, 140, 0, 0.4);
  border-radius: 10px;
  margin-bottom: 20px;
`;

const ComparisonGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 1400px;
`;

const ModelCard = styled.div`
  background: #1e1e1e;
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
  border: 1px solid #333;
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const CardTitle = styled.h3`
  color: #ff8c00;
  margin: 0 0 10px 0;
  font-size: 22px;
  border-bottom: 2px solid #ff8c00;
  padding-bottom: 10px;
`;

const Stat = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 16px;
`;

const StatLabel = styled.span`
  color: #a0a0a0;
`;

const StatValue = styled.span`
  font-weight: bold;
  color: ${props => props.color || '#e0e0e0'};
`;

const AccuracyBarContainer = styled.div`
  width: 100%;
  height: 20px;
  background-color: #333;
  border-radius: 10px;
  overflow: hidden;
`;

const AccuracyBar = styled.div`
  width: ${props => props.percentage}%;
  height: 100%;
  background: linear-gradient(90deg, #28a745, #86e07f);
  border-radius: 10px;
  transition: width 0.5s ease-in-out;
`;

const TrendIndicator = styled.div`
  font-size: 14px;
  color: ${props => props.match ? '#28a745' : '#dc3545'};
  font-weight: bold;
`;

function ModelPerformanceComparison() {
  const [performanceData, setPerformanceData] = useState([]);
  // const [error, setError] = useState('');

  useEffect(() => {
    // // ส่วนนี้สำหรับเรียก API จริง (คอมเมนต์ไว้ก่อน)
    // const fetchPerformance = async () => {
    //   // ... API call logic here ...
    // };
    // fetchPerformance();

    // ใช้ข้อมูลสมมติ
    setPerformanceData(mockModelPerformance);
  }, []);

  return (
    <MainContent>
      <Header>Model Performance Comparison</Header>
      <ComparisonGrid>
        {performanceData.map(model => (
          <ModelCard key={model.id}>
            <CardTitle>{model.name}</CardTitle>
            <Stat>
              <StatLabel>Accuracy (Price Prediction)</StatLabel>
              <StatValue color="#28a745">{model.accuracy.toFixed(1)}%</StatValue>
            </Stat>
            <AccuracyBarContainer>
              <AccuracyBar percentage={model.accuracy} />
            </AccuracyBarContainer>
            <Stat>
              <StatLabel>Trend Analysis (Actual vs. Predicted)</StatLabel>
              <TrendIndicator match={model.trendAnalysis.match}>
                {model.trendAnalysis.match ? '✔ Match' : '❌ Mismatch'}
              </TrendIndicator>
            </Stat>
            <Stat>
              <StatLabel>Win / Loss Trades</StatLabel>
              <StatValue>{model.winLossRatio}</StatValue>
            </Stat>
            <Stat>
              <StatLabel>Average Profit / Trade</StatLabel>
              <StatValue color={model.avgProfit > 0 ? '#28a745' : '#dc3545'}>
                ${model.avgProfit.toFixed(2)}
              </StatValue>
            </Stat>
          </ModelCard>
        ))}
      </ComparisonGrid>
    </MainContent>
  );
}

export default ModelPerformanceComparison;