// src/pages/AITradeMonitor.js
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import axios from 'axios';

// === API ของ AI Auto Trades (ใช้ตาราง autotrade) ===
const API_URL = 'http://localhost:3000/api/admin/ai-trades';
const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return { headers: { Authorization: `Bearer ${token}` } };
};

// --- Helpers ---
const formatTimestamp = (isoString) => {
  if (!isoString) return 'N/A';
  return new Date(isoString).toLocaleString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};
const formatPrice = (price) => {
  const n = Number(price);
  if (Number.isNaN(n)) return '-';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// --- Styled ---
const MainContent = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center;
  overflow-y: auto; padding: 20px; color: #e0e0e0;
`;
const Header = styled.header`
  width: 100%; background: #ff8c00; padding: 15px; text-align: center;
  color: white; font-size: 28px; font-weight: bold;
  box-shadow: 0 4px 8px rgba(255,140,0,0.4); border-radius: 10px; margin-bottom: 20px;
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
  background-color: ${p => p.action?.toLowerCase() === 'buy' ? '#28a745' : '#dc3545'};
`;
const StatusBadge = styled.span`
  padding: 4px 10px; border-radius: 5px; font-weight: bold; text-transform: uppercase; color: #111;
  background-color: ${p => {
    const s = String(p.status || '').toLowerCase();
    if (s === 'filled' || s === 'done' || s === 'success') return '#98FB98';
    if (s === 'pending' || s === 'open') return '#F8DE7E';
    if (s === 'cancelled' || s === 'rejected' || s === 'error') return '#FF7F7F';
    return '#bdbdbd';
  }};
`;
const PaginationContainer = styled.div`
  display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 20px;
`;
const PageButton = styled.button`
  padding: 8px 12px; border: 1px solid #ff8c00; border-radius: 5px; cursor: pointer;
  color: ${p => p.active ? '#1e1e1e' : '#ff8c00'};
  background-color: ${p => p.active ? '#ff8c00' : 'transparent'};
  font-weight: bold; transition: background-color 0.3s, color 0.3s;
  &:hover:not(:disabled) { background-color: #ff8c00; color: #1e1e1e; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;
const FeedbackMessage = styled.p`
  text-align: center; padding: 14px 10px;
  color: ${p => (p.isError ? '#dc3545' : '#a0a0a0')};
`;

function AITradeMonitor() {
  const [trades, setTrades] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTrades, setTotalTrades] = useState(0);
  const limit = 20;

  const fetchTrades = async (pageToLoad = 1) => {
    setIsLoading(true);
    setError('');
    try {
      const url = `${API_URL}?page=${pageToLoad}&limit=${limit}&orderBy=TradeDate&order=DESC`;
      const res = await axios.get(url, getAuthHeaders());
      const payload = res.data || {};
      const rows = Array.isArray(payload.data) ? payload.data : [];

      const mapped = rows.map(r => ({
        id: r.AutoTradeID,
        timestamp: r.TradeDate,
        user: r.Username || String(r.UserID),
        symbol: r.StockSymbol,
        action: String(r.TradeType || '').toLowerCase(),
        quantity: r.Quantity,
        price: r.Price,
        status: r.Status,
        portfolioId: r.PaperPortfolioID
      }));

      setTrades(mapped);

      const pg = payload.pagination || {};
      setPage(pg.currentPage || pageToLoad);
      setTotalPages(pg.totalPages || 1);
      setTotalTrades(pg.totalTrades || 0);
    } catch (err) {
      console.error('Error loading AI trades:', err?.response?.status, err?.response?.data || err);
      setError(err?.response?.data?.error || 'Failed to load AI trades.');
      setTrades([]);
      setTotalPages(1);
      setTotalTrades(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchTrades(1); }, []);

  const goPrev = () => page > 1 && fetchTrades(page - 1);
  const goNext = () => page < totalPages && fetchTrades(page + 1);

  const COLSPAN = 8;

  return (
    <MainContent>
      <Header>AI Trade History</Header>
      <TableContainer>
        <TradeTable>
          <TableHead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Symbol</th>
              <th>Action</th>
              <th>Quantity</th>
              <th>Price</th>
              <th>Status</th>
              <th>Portfolio</th>
            </tr>
          </TableHead>

          <tbody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={COLSPAN} style={{ color: '#a0a0a0' }}>Loading...</TableCell>
              </TableRow>
            ) : (
              trades.map(trade => (
                <TableRow key={trade.id}>
                  <TableCell>{formatTimestamp(trade.timestamp)}</TableCell>
                  <TableCell>{trade.user}</TableCell>
                  <TableCell>{trade.symbol}</TableCell>
                  <TableCell><ActionBadge action={trade.action}>{trade.action}</ActionBadge></TableCell>
                  <TableCell>{trade.quantity}</TableCell>
                  <TableCell>${formatPrice(trade.price)}</TableCell>
                  <TableCell><StatusBadge status={trade.status}>{String(trade.status || '').toUpperCase()}</StatusBadge></TableCell>
                  <TableCell>{trade.portfolioId ?? '—'}</TableCell>
                </TableRow>
              ))
            )}
          </tbody>
        </TradeTable>

        {!isLoading && !!error && <FeedbackMessage isError>{error}</FeedbackMessage>}
        {!isLoading && !error && trades.length === 0 && (
          <FeedbackMessage>No AI trades found.</FeedbackMessage>
        )}

        <PaginationContainer>
          <PageButton onClick={goPrev} disabled={page <= 1}>ก่อนหน้า</PageButton>
          <span style={{ color: '#a0a0a0' }}>
            หน้า {page} / {totalPages} • รวม {totalTrades.toLocaleString()} รายการ
          </span>
          <PageButton onClick={goNext} disabled={page >= totalPages}>ถัดไป</PageButton>
        </PaginationContainer>
      </TableContainer>
    </MainContent>
  );
}

export default AITradeMonitor;
