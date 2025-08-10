import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import axios from 'axios';
// import { useNavigate } from 'react-router-dom'; // ถ้ายังไม่ใช้ คอมเมนต์ไว้ได้

// === API Config ===
const API_URL = 'http://localhost:3000/api/admin/ai-trades';
const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return { headers: { Authorization: `Bearer ${token}` } };
};

// --- Helper Functions ---
const formatTimestamp = (isoString) => {
  if (!isoString) return 'N/A';
  return new Date(isoString).toLocaleString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatPrice = (price) => {
  const numPrice = Number(price);
  if (isNaN(numPrice)) return '-';
  return numPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// --- Styled Components (เหมือนเดิม) ---
const MainContent = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center;
  overflow-y: auto; padding: 20px; color: #e0e0e0;
`;
const Header = styled.header`
  width: 100%; background: #ff8c00; padding: 15px; text-align: center;
  color: white; font-size: 28px; font-weight: bold;
  box-shadow: 0 4px 8px rgba(255, 140, 0, 0.4); border-radius: 10px; margin-bottom: 20px;
`;
const TableContainer = styled.div`
  background: #1e1e1e; padding: 20px; border-radius: 10px;
  width: 100%; max-width: 1400px; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
`;
const TradeTable = styled.table`
  width: 100%; border-collapse: collapse; text-align: left;
`;
const TableHead = styled.thead`
  th {
    padding: 12px 15px; font-weight: bold; color: #ff8c00;
    border-bottom: 2px solid #ff8c00; text-transform: uppercase; font-size: 14px;
  }
`;
const TableRow = styled.tr`
  border-bottom: 1px solid #333;
  &:hover { background-color: #2a2a2a; }
`;
const TableCell = styled.td`
  padding: 12px 15px;
`;
const ActionBadge = styled.span`
  padding: 4px 10px; border-radius: 5px; font-weight: bold; color: white; text-transform: uppercase;
  background-color: ${props => props.action.toLowerCase() === 'buy' ? '#28a745' : '#dc3545'};
`;

const PaginationContainer = styled.div`
  display: flex; justify-content: center; align-items: center;
  gap: 10px; margin-top: 20px;
`;
const PageButton = styled.button`
  padding: 8px 12px; border: 1px solid #ff8c00; border-radius: 5px; cursor: pointer;
  color: ${props => props.active ? '#1e1e1e' : '#ff8c00'};
  background-color: ${props => props.active ? '#ff8c00' : 'transparent'};
  font-weight: bold; transition: background-color 0.3s, color 0.3s;
  &:hover:not(:disabled) { background-color: #ff8c00; color: #1e1e1e; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;
const FeedbackMessage = styled.p`
  text-align: center; padding: 40px 20px; font-size: 18px;
  color: ${props => (props.isError ? '#dc3545' : '#a0a0a0')};
`;

function AITradeMonitor() {
  const [trades, setTrades] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTrades, setTotalTrades] = useState(0);
  const limit = 20; // ปรับได้ตามใจ

  const fetchTrades = async (pageToLoad = 1) => {
    setIsLoading(true);
    setError('');
    try {
      const url = `${API_URL}?page=${pageToLoad}&limit=${limit}&orderBy=TradeDate&order=DESC`;
      const res = await axios.get(url, getAuthHeaders());
      const payload = res.data || {};
      const rows = Array.isArray(payload.data) ? payload.data : [];

      // map คอลัมน์จาก API → shape ที่หน้า UI ใช้
      const mapped = rows.map(r => ({
        id: r.PaperTradeID,
        timestamp: r.TradeDate,
        user: r.Username || String(r.UserID),      // ใช้ UserID แสดงแทนชื่อไปก่อน
        symbol: r.StockSymbol,
        action: String(r.TradeType || '').toLowerCase(), // 'buy' | 'sell'
        quantity: r.Quantity,
        price: r.Price
      
      }));

      setTrades(mapped);

      const pg = payload.pagination || {};
      setPage(pg.currentPage || pageToLoad);
      setTotalPages(pg.totalPages || 1);
      setTotalTrades(pg.totalTrades || 0);
    } catch (err) {
      console.error('Error loading trades:', err?.response?.status, err?.response?.data || err);
      setError(err?.response?.data?.error || 'Failed to load trades.');
      setTrades([]);
      setTotalPages(1);
      setTotalTrades(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goPrev = () => {
    if (page > 1) {
      const target = page - 1;
      fetchTrades(target);
    }
  };
  const goNext = () => {
    if (page < totalPages) {
      const target = page + 1;
      fetchTrades(target);
    }
  };

  const renderContent = () => {
    if (isLoading) return <FeedbackMessage>Loading trades...</FeedbackMessage>;
    if (error) return <FeedbackMessage isError>{error}</FeedbackMessage>;
    if (trades.length === 0) return <FeedbackMessage>No trades found.</FeedbackMessage>;

    return (
      <>
        <TradeTable>
          <TableHead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Symbol</th>
              <th>Action</th>
              <th>Quantity</th>
              <th>Price</th>
              
            </tr>
          </TableHead>
          <tbody>
            {trades.map((trade) => (
              <TableRow key={trade.id}>
                <TableCell>{formatTimestamp(trade.timestamp)}</TableCell>
                <TableCell>{trade.user}</TableCell>
                <TableCell>{trade.symbol}</TableCell>
                <TableCell><ActionBadge action={trade.action}>{trade.action}</ActionBadge></TableCell>
                <TableCell>{trade.quantity}</TableCell>
                <TableCell>${formatPrice(trade.price)}</TableCell>
                
              </TableRow>
            ))}
          </tbody>
        </TradeTable>

        <PaginationContainer>
          <PageButton onClick={goPrev} disabled={page <= 1}>ก่อนหน้า</PageButton>
          <span style={{ color: '#a0a0a0' }}>
            หน้า {page} / {totalPages} • รวม {totalTrades.toLocaleString()} รายการ
          </span>
          <PageButton onClick={goNext} disabled={page >= totalPages}>ถัดไป</PageButton>
        </PaginationContainer>
      </>
    );
  };

  return (
    <MainContent>
      <Header>AI Trade Monitoring</Header>
      <TableContainer>
        {renderContent()}
      </TableContainer>
    </MainContent>
  );
}

export default AITradeMonitor;
