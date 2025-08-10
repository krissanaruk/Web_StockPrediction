import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import axios from 'axios';
import OverviewChart from '../components/OverviewChart';
import { FaArrowUp, FaArrowDown } from 'react-icons/fa';

// ชี้ไปที่พอร์ต backend ที่รัน Node/Express (ส่วนใหญ่ 3000)
const API_URL = 'http://localhost:3000/api';

// --- Styled Components (เหมือนเดิม) ---
const DashboardGrid = styled.div`
  padding: 20px;
  display: grid;
  gap: 20px;
  grid-template-columns: repeat(2, 1fr);
`;
const HeaderContainer = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  grid-column: 1 / -1;
  gap: 20px;
  flex-wrap: wrap;
`;
const Header = styled.h2`
  color: #ff8c00;
  margin: 0;
  font-size: 28px;
  margin-right: auto;
`;
const Selector = styled.select`
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  outline: none;
  background: #333;
  color: white;
  font-size: 16px;
  font-weight: bold;
`;
const TimeframeSelector = styled.div`
  display: flex;
  background-color: #2a2a2a;
  border-radius: 8px;
  padding: 4px;
  border: 1px solid #444;
`;
const TimeframeButton = styled.button`
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  font-size: 14px;
  transition: background-color 0.3s, color 0.3s;
  background-color: ${props => (props.active ? '#ff8c00' : 'transparent')};
  color: ${props => (props.active ? '#1e1e1e' : '#e0e0e0')};
  &:hover {
    background-color: ${props => (props.active ? '#ff8c00' : '#444')};
  }
`;
const ChartCard = styled.div`
  background: #1e1e1e;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  border: 1px solid #333;
  min-height: 450px;
  display: flex;
  flex-direction: column;
  grid-column: 1 / -1;
`;
const ChartTitle = styled.h3`
  color: #ff8c00;
  margin: 0 0 15px 0;
  font-size: 18px;
`;
const ListCard = styled.div`
  background: #1e1e1e;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  border: 1px solid #333;
`;
const ListTitle = styled.h3`
  color: #ff8c00;
  margin: 0 0 15px 0;
  font-size: 18px;
  border-bottom: 1px solid #333;
  padding-bottom: 10px;
`;
const StockItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  font-size: 16px;
  border-bottom: 1px solid #2a2a2a;
  &:last-child {
    border-bottom: none;
  }
`;
const StockInfoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;
const StockSymbol = styled.span`
  font-weight: bold;
`;
const StockPriceAndChange = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
`;
const StockPrice = styled.span`
  color: #b0b0b0;
  font-size: 14px;
`;
const StockChange = styled.span`
  color: ${props => (props.positive ? '#28a745' : '#dc3545')};
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: bold;
`;
const StockSignalBadge = styled.span`
  font-size: 12px;
  font-weight: bold;
  padding: 4px 10px;
  border-radius: 12px;
  color: white;
  background-color: ${props => {
    if (props.signal === 'BUY') return '#28a745';
    if (props.signal === 'SELL') return '#dc3545';
    return '#6c757d';
  }};
`;

// --- Main Dashboard Component ---
function Dashboard() {
  const [selectedMarket, setSelectedMarket] = useState('Thailand');
  const [selectedStock, setSelectedStock] = useState('');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1M');
  const [availableStocks, setAvailableStocks] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [marketMovers, setMarketMovers] = useState({ topGainers: [], topLosers: [] });
  const [marketMoversDate, setMarketMoversDate] = useState('');
  const [isLoading, setIsLoading] = useState({ stocks: false, chart: false, movers: false });
  const [error, setError] = useState({ stocks: '', chart: '', movers: '' });

  const timeframes = ['5D', '1M', '3M', '6M', '1Y', 'ALL'];

  const getAuthHeaders = () => {
    const token = localStorage.getItem('adminToken');
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const safeNumber = (val, fallback = 0) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  };

  const formatPrice = (price, market) => {
    const numPrice = safeNumber(price, null);
    if (numPrice === null) return 'N/A';
    const currencySymbol = market === 'Thailand' ? '฿' : '$';
    return `${currencySymbol}${numPrice.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const formatPercentage = (perc, useAbs = false) => {
    const num = safeNumber(perc, 0);
    const value = useAbs ? Math.abs(num) : num;
    return value.toFixed(2);
  };

  // รองรับทั้ง 'YYYY-MM-DD' และ 'YYYY-MM-DDTHH:mm:ssZ'
  const formatMoversDate = (dateString) => {
    if (!dateString) return 'Latest';
    const datePart = String(dateString).split('T')[0];
    const parts = datePart.split('-');
    if (parts.length !== 3) return dateString;
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  useEffect(() => {
    const fetchDataForMarket = async () => {
      if (!selectedMarket) return;

      setIsLoading(prev => ({ ...prev, stocks: true, movers: true }));
      setError({ stocks: '', chart: '', movers: '' });
      setMarketMoversDate('');

      try {
        // ดึงรายการหุ้น + market movers พร้อมกัน
        const [stocksResponse, moversResponse] = await Promise.all([
          axios.get(`${API_URL}/stocks?market=${encodeURIComponent(selectedMarket)}`, getAuthHeaders()),
          axios.get(`${API_URL}/market-movers?market=${encodeURIComponent(selectedMarket)}`, getAuthHeaders())
        ]);

        const stocks = stocksResponse?.data?.data ?? [];
        setAvailableStocks(stocks);

        const moversPayload = moversResponse?.data ?? {};
        const moversData = moversPayload?.data ?? { topGainers: [], topLosers: [] };

        setMarketMovers({
          topGainers: Array.isArray(moversData.topGainers) ? moversData.topGainers : [],
          topLosers: Array.isArray(moversData.topLosers) ? moversData.topLosers : []
        });
        setMarketMoversDate(moversPayload?.date || '');

        // ตั้งค่าหุ้นตัวแรกใน list เป็นค่าเริ่มต้น
        if (stocks.length > 0) {
          setSelectedStock(stocks[0].StockSymbol);
        } else {
          setSelectedStock('');
        }
      } catch (err) {
        console.error(`Error fetching data for ${selectedMarket}:`, err);
        setError(prev => ({
          ...prev,
          stocks: 'Failed to load stock list.',
          movers: 'Failed to load market movers.'
        }));
        setAvailableStocks([]);
        setMarketMovers({ topGainers: [], topLosers: [] });
        setSelectedStock('');
      } finally {
        setIsLoading(prev => ({ ...prev, stocks: false, movers: false }));
      }
    };

    fetchDataForMarket();
  }, [selectedMarket]);

  useEffect(() => {
    const fetchChartData = async () => {
      if (!selectedStock) return;

      setIsLoading(prev => ({ ...prev, chart: true }));
      setError(prev => ({ ...prev, chart: '' }));
      setChartData([]);

      try {
        const endpoint = `${API_URL}/chart-data/${encodeURIComponent(selectedStock)}?timeframe=${encodeURIComponent(selectedTimeframe)}`;
        const response = await axios.get(endpoint, getAuthHeaders());

        const rows = response?.data?.data ?? [];
        const transformedData = rows.map(item => ({
          ...item,
          date: new Date(item.date).getTime()
        }));

        setChartData(transformedData);
      } catch (err) {
        console.error('Error fetching chart data:', err);
        setError(prev => ({ ...prev, chart: 'Failed to load chart data.' }));
      } finally {
        setIsLoading(prev => ({ ...prev, chart: false }));
      }
    };

    fetchChartData();
  }, [selectedStock, selectedTimeframe]);

  const handleMarketChange = (e) => {
    const newMarket = e.target.value;
    setSelectedMarket(newMarket);
  };

  return (
    <DashboardGrid>
      <HeaderContainer>
        <Header>Dashboard Overview</Header>
        <Selector value={selectedMarket} onChange={handleMarketChange}>
          <option value="Thailand">Thailand (TH)</option>
          <option value="America">United States (USA)</option>
        </Selector>
        <Selector value={selectedStock} onChange={(e) => setSelectedStock(e.target.value)}>
          {isLoading.stocks ? (
            <option disabled>Loading...</option>
          ) : (
            availableStocks.map(stock => (
              <option key={stock.StockSymbol} value={stock.StockSymbol}>
                {stock.StockSymbol}
              </option>
            ))
          )}
        </Selector>
      </HeaderContainer>

      <ChartCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <ChartTitle>
            {selectedStock ? `Price Chart for ${selectedStock}` : 'Select a stock to view chart'}
          </ChartTitle>
          <TimeframeSelector>
            {['5D', '1M', '3M', '6M', '1Y', 'ALL'].map(tf => (
              <TimeframeButton key={tf} active={selectedTimeframe === tf} onClick={() => setSelectedTimeframe(tf)}>
                {tf}
              </TimeframeButton>
            ))}
          </TimeframeSelector>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isLoading.chart ? (
            <p>Loading Chart...</p>
          ) : error.chart ? (
            <p style={{ color: 'red' }}>{error.chart}</p>
          ) : chartData.length > 0 ? (
            <OverviewChart
              data={chartData}
              dataKey={selectedStock}
              market={selectedMarket}
              timeframe={selectedTimeframe}
            />
          ) : (
            <p>{selectedStock ? 'No chart data available.' : ''}</p>
          )}
        </div>
      </ChartCard>

      <ListCard>
        <ListTitle>Top Gainers ({formatMoversDate(marketMoversDate)})</ListTitle>
        {isLoading.movers ? (
          <p>Loading...</p>
        ) : error.movers ? (
          <p style={{ color: 'red' }}>{error.movers}</p>
        ) : marketMovers?.topGainers?.length > 0 ? (
          marketMovers.topGainers.map((stock) => {
            const chg = safeNumber(stock.Changepercen, 0);
            return (
              <StockItem key={stock.StockSymbol}>
                <StockInfoContainer>
                  <StockSymbol>{stock.StockSymbol}</StockSymbol>
                </StockInfoContainer>
                <StockPriceAndChange>
                  <StockPrice>{formatPrice(stock.ClosePrice, selectedMarket)}</StockPrice>
                  <StockChange positive={chg >= 0}>
                    {chg > 0 && <FaArrowUp />}
                    {chg < 0 && <FaArrowDown />}
                    {formatPercentage(chg, true)}%
                  </StockChange>
                </StockPriceAndChange>
              </StockItem>
            );
          })
        ) : (
          <p style={{ textAlign: 'center', color: '#a0a0a0', marginTop: '20px' }}>No top gainers found.</p>
        )}
      </ListCard>

      <ListCard>
        <ListTitle>Top Losers ({formatMoversDate(marketMoversDate)})</ListTitle>
        {isLoading.movers ? (
          <p>Loading...</p>
        ) : error.movers ? (
          <p style={{ color: 'red' }}>{error.movers}</p>
        ) : marketMovers?.topLosers?.length > 0 ? (
          marketMovers.topLosers.map((stock) => {
            const chg = safeNumber(stock.Changepercen, 0);
            return (
              <StockItem key={stock.StockSymbol}>
                <StockInfoContainer>
                  <StockSymbol>{stock.StockSymbol}</StockSymbol>
                </StockInfoContainer>
                <StockPriceAndChange>
                  <StockPrice>{formatPrice(stock.ClosePrice, selectedMarket)}</StockPrice>
                  <StockChange positive={chg >= 0}>
                    {chg > 0 && <FaArrowUp />}
                    {chg < 0 && <FaArrowDown />}
                    {formatPercentage(chg, true)}%
                  </StockChange>
                </StockPriceAndChange>
              </StockItem>
            );
          })
        ) : (
          <p style={{ textAlign: 'center', color: '#a0a0a0', marginTop: '20px' }}>No top losers found.</p>
        )}
      </ListCard>
    </DashboardGrid>
  );
}

export default Dashboard;
