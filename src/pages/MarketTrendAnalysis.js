import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
// import axios from 'axios';

// --- Mock Data ---
const mockTechnicalData = {
  'PTT': {
    country: 'TH',
    ma: { ma50: 35.50, ma200: 34.25, signal: 'Golden Cross', signalColor: '#28a745' },
    rsi: { value: 68.5, signal: 'Approaching Overbought', signalColor: '#ffc107' },
    macd: { macdLine: 0.75, signalLine: 0.60, signal: 'Bullish Crossover', signalColor: '#28a745' },
    bollinger: { upper: 36.75, middle: 35.25, lower: 33.75, signal: 'Price near Upper Band', signalColor: '#ffc107' },
    strategy: {
      latestSignal: 'BUY',
      signalPrice: 35.40,
      reason: 'Golden Cross confirmed by Bullish MACD.',
      effectiveness: 82
    }
  },
  'AOT': {
    country: 'TH',
    ma: { ma50: 65.25, ma200: 68.00, signal: 'Bearish Momentum', signalColor: '#dc3545' },
    rsi: { value: 42.1, signal: 'Neutral', signalColor: '#6c757d' },
    macd: { macdLine: -0.50, signalLine: -0.45, signal: 'Bearish Crossover', signalColor: '#dc3545' },
    bollinger: { upper: 68.50, middle: 66.00, lower: 63.50, signal: 'Price near Lower Band', signalColor: '#ffc107' },
    strategy: {
      latestSignal: 'SELL',
      signalPrice: 65.00,
      reason: 'Bearish MACD confirmed by price breaking below MA50.',
      effectiveness: 68
    }
  },
  'DELTA': {
    country: 'TH',
    ma: { ma50: 88.50, ma200: 85.00, signal: 'Bullish Momentum', signalColor: '#28a745' },
    rsi: { value: 75.0, signal: 'Overbought', signalColor: '#dc3545' },
    macd: { macdLine: 1.20, signalLine: 1.00, signal: 'Bullish Crossover', signalColor: '#28a745' },
    bollinger: { upper: 92.00, middle: 88.00, lower: 84.00, signal: 'Price at Upper Band', signalColor: '#dc3545' },
    strategy: {
      latestSignal: 'SELL',
      signalPrice: 91.50,
      reason: 'RSI indicates overbought, potential for a pullback.',
      effectiveness: 71
    }
  },
  'AAPL': {
    country: 'USA',
    ma: { ma50: 172.30, ma200: 175.50, signal: 'Death Cross', signalColor: '#dc3545' },
    rsi: { value: 45.2, signal: 'Neutral', signalColor: '#6c757d' },
    macd: { macdLine: -1.20, signalLine: -1.10, signal: 'Bearish Momentum', signalColor: '#dc3545' },
    bollinger: { upper: 178.50, middle: 173.00, lower: 167.50, signal: 'Price near Middle Band', signalColor: '#6c757d' },
    strategy: {
      latestSignal: 'HOLD',
      signalPrice: null,
      reason: 'RSI is neutral and price is within Bollinger Bands. Waiting for a clear signal.',
      effectiveness: 75
    }
  },
  'MSFT': {
    country: 'USA',
    ma: { ma50: 330.10, ma200: 320.50, signal: 'Golden Cross', signalColor: '#28a745' },
    rsi: { value: 65.8, signal: 'Approaching Overbought', signalColor: '#ffc107' },
    macd: { macdLine: 2.50, signalLine: 2.20, signal: 'Bullish Crossover', signalColor: '#28a745' },
    bollinger: { upper: 340.00, middle: 330.00, lower: 320.00, signal: 'Price near Upper Band', signalColor: '#ffc107' },
    strategy: {
      latestSignal: 'BUY',
      signalPrice: 332.00,
      reason: 'Strong bullish signals from MA and MACD.',
      effectiveness: 85
    }
  },
  'GOOGL': {
    country: 'USA',
    ma: { ma50: 135.00, ma200: 130.00, signal: 'Bullish Momentum', signalColor: '#28a745' },
    rsi: { value: 55.3, signal: 'Neutral', signalColor: '#6c757d' },
    macd: { macdLine: 0.90, signalLine: 0.85, signal: 'Bullish Momentum', signalColor: '#28a745' },
    bollinger: { upper: 140.00, middle: 135.00, lower: 130.00, signal: 'Price near Middle Band', signalColor: '#6c757d' },
    strategy: {
      latestSignal: 'HOLD',
      signalPrice: null,
      reason: 'Neutral RSI, waiting for stronger confirmation.',
      effectiveness: 78
    }
  },
};

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

const AnalysisContainer = styled.div`
  background: #1e1e1e;
  padding: 25px;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
  border: 1px solid #333;
  width: 100%;
  max-width: 1400px;
`;

const CardTitle = styled.h3`
  color: #ff8c00;
  margin: 0 0 20px 0;
  font-size: 22px;
  border-bottom: 2px solid #ff8c00;
  padding-bottom: 10px;
`;

const SelectorContainer = styled.div`
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
`;

const StockSelector = styled.select`
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  outline: none;
  background: #333;
  color: white;
  font-size: 16px;
  font-weight: bold;
`;

const IndicatorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
`;

const IndicatorCard = styled.div`
  background: #2a2a2a;
  padding: 20px;
  border-radius: 10px;
  border-left: 5px solid ${props => props.color || '#ff8c00'};
`;

const IndicatorTitle = styled.h4`
  margin: 0 0 10px 0;
  font-size: 18px;
  color: #e0e0e0;
`;

const IndicatorValue = styled.p`
  font-size: 24px;
  font-weight: bold;
  margin: 0 0 5px 0;
  color: #ff8c00;
`;

const IndicatorSignal = styled.p`
  font-size: 14px;
  margin: 0;
  font-weight: bold;
  color: ${props => props.color || '#a0a0a0'};
`;

const StrategyCard = styled.div`
  background: linear-gradient(45deg, #2a2a2a, #333);
  padding: 25px;
  border-radius: 12px;
  margin-top: 20px;
  display: flex;
  justify-content: space-around;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
`;

const SignalDisplay = styled.div`
  text-align: center;
`;

const SignalLabel = styled.p`
  margin: 0;
  font-size: 18px;
  color: #a0a0a0;
  text-transform: uppercase;
`;

const SignalValue = styled.p`
  margin: 5px 0 0 0;
  font-size: 48px;
  font-weight: bold;
  color: ${props => {
    if (props.signal === 'BUY') return '#28a745';
    if (props.signal === 'SELL') return '#dc3545';
    return '#6c757d';
  }};
`;

const StrategyDetails = styled.div`
  flex: 1;
  min-width: 300px;
`;

const DetailItem = styled.p`
  margin: 8px 0;
  font-size: 16px;
  strong {
    color: #ff8c00;
    margin-right: 8px;
  }
`;

function MarketTrendAnalysis() {
  const [selectedCountry, setSelectedCountry] = useState('TH');
  const [selectedStock, setSelectedStock] = useState('PTT');
  const [technicalData, setTechnicalData] = useState(null);

  // Filter available stocks based on the selected country
  const availableStocks = Object.keys(mockTechnicalData).filter(
    key => mockTechnicalData[key].country === selectedCountry
  );

  useEffect(() => {
    // This would be an API call based on selectedStock
    // For now, we use mock data
    setTechnicalData(mockTechnicalData[selectedStock]);
  }, [selectedStock]);

  if (!technicalData) {
    return <MainContent>Loading technical data...</MainContent>;
  }

  // Handler for country change
  const handleCountryChange = (e) => {
    const newCountry = e.target.value;
    setSelectedCountry(newCountry);
    // Automatically select the first stock of the new country
    const firstStockOfNewCountry = Object.keys(mockTechnicalData).find(
      key => mockTechnicalData[key].country === newCountry
    );
    if (firstStockOfNewCountry) {
      setSelectedStock(firstStockOfNewCountry);
    }
  };

  const { ma, rsi, macd, bollinger, strategy } = technicalData;

  return (
    <MainContent>
      <Header>Market Trend Analysis</Header>
      <AnalysisContainer>
        <CardTitle>Technical Indicator Analysis</CardTitle>
        <SelectorContainer>
          <label htmlFor="country-select" style={{ fontWeight: 'bold' }}>Select Market:</label>
          <StockSelector id="country-select" value={selectedCountry} onChange={handleCountryChange}>
            <option value="TH">Thailand (TH)</option>
            <option value="USA">United States (USA)</option>
          </StockSelector>
          <label htmlFor="stock-select" style={{ fontWeight: 'bold' }}>Select Stock:</label>
          <StockSelector id="stock-select" value={selectedStock} onChange={(e) => setSelectedStock(e.target.value)}>
            {availableStocks.map(stockSymbol => (
              <option key={stockSymbol} value={stockSymbol}>
                {stockSymbol}
              </option>
            ))}
          </StockSelector>
        </SelectorContainer>
        <IndicatorGrid>
          <IndicatorCard color={ma.signalColor}>
            <IndicatorTitle>Moving Averages (MA)</IndicatorTitle>
            <IndicatorValue>{`MA50: ${ma.ma50.toFixed(2)}`}</IndicatorValue>
            <IndicatorSignal color={ma.signalColor}>{ma.signal}</IndicatorSignal>
          </IndicatorCard>
          <IndicatorCard color={rsi.signalColor}>
            <IndicatorTitle>RSI (14)</IndicatorTitle>
            <IndicatorValue>{rsi.value.toFixed(2)}</IndicatorValue>
            <IndicatorSignal color={rsi.signalColor}>{rsi.signal}</IndicatorSignal>
          </IndicatorCard>
          <IndicatorCard color={macd.signalColor}>
            <IndicatorTitle>MACD</IndicatorTitle>
            <IndicatorValue>{`MACD: ${macd.macdLine.toFixed(2)}`}</IndicatorValue>
            <IndicatorSignal color={macd.signalColor}>{macd.signal}</IndicatorSignal>
          </IndicatorCard>
          <IndicatorCard color={bollinger.signalColor}>
            <IndicatorTitle>Bollinger Bands</IndicatorTitle>
            <IndicatorValue>{`Upper: ${bollinger.upper.toFixed(2)}`}</IndicatorValue>
            <IndicatorSignal color={bollinger.signalColor}>{bollinger.signal}</IndicatorSignal>
          </IndicatorCard>
        </IndicatorGrid>
        <CardTitle style={{ marginTop: '40px' }}>Strategy & Signals</CardTitle>
        <StrategyCard>
          <SignalDisplay>
            <SignalLabel>Latest Signal</SignalLabel>
            <SignalValue signal={strategy.latestSignal}>
              {strategy.latestSignal}
            </SignalValue>
          </SignalDisplay>
          <StrategyDetails>
            <DetailItem>
              <strong>Reason:</strong>
              <span>{strategy.reason}</span>
            </DetailItem>
            <DetailItem>
              <strong>Signal Price:</strong>
              <span>{strategy.signalPrice ? `$${strategy.signalPrice.toFixed(2)}` : 'N/A'}</span>
            </DetailItem>
            <DetailItem>
              <strong>Strategy Effectiveness:</strong>
              <span>{strategy.effectiveness}%</span>
            </DetailItem>
          </StrategyDetails>
        </StrategyCard>
      </AnalysisContainer>
    </MainContent>
  );
}

export default MarketTrendAnalysis;

