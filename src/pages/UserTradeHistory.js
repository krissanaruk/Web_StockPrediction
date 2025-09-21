// src/pages/UserTradeHistory.js
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import axios from 'axios';

// === API (ชั่วคราวใช้ของ AI ก่อน) ===
// TODO: เปลี่ยนเป็น /api/admin/trades?source=USER เมื่อพร้อม
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
  width: 100%; background: #ff8c00; padding: 15px; text-align: center; color: white;
  font-size: 28px; font-weight: bold; box-shadow: 0 4px 8px rgba(255, 140, 0, 0.4);
  border-radius: 10px; margin-bottom: 20px;
`;
const TableContainer = styled.div`
  background: #1e1e1e; padding: 20px; border-radius: 10px;
  width: 100%; max-width: 1400px; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
`;
const TradeTable = styled.table` width: 100%; border-collapse: collapse; text-align: left; `;
const TableHead = styled.thead`
  th {
    padding: 12px 15px; font-weight: bold; color: #ff8c00;
    border-bottom: 2px solid #ff8c00; text-transform: uppercase; font-size: 14px;
  }
`;
const TableRow = styled.tr` border-bottom: 1px solid #333; &:hover { background-color: #2a2a2a; } `;
const TableCell = styled.td` padding: 12px 15px; `;
const ActionBadge = styled.span`
  padding: 4px 10px; border-radius: 5px; font-weight: bold; color: white; text-transform: uppercase;
  background-color: ${p => p.action.toLowerCase() === 'buy' ? '#28a745' : '#dc3545'};
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
  text-align: center; padding: 40px 20px; font-size: 18px;
  color: ${p => (p.isError ? '#dc3545' : '#a0a0a0')};
`;

export default function UserTradeHistory() {
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
        id: r.PaperTradeID,
        timestamp: r.TradeDate,
        user: r.Username || String(r.UserID),
        symbol: r.StockSymbol,
        action: String(r.TradeType || '').toLowerCase(),
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
      setTrades([]); setTotalPages(1); setTotalTrades(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchTrades(1); }, []);

  const goPrev = () => page > 1 && fetchTrades(page - 1);
  const goNext = () => page < totalPages && fetchTrades(page + 1);

  return (
    <MainContent>
      <Header>User Trade History</Header>
      <TableContainer>
        {isLoading ? <FeedbackMessage>Loading trades...</FeedbackMessage> :
         error ? <FeedbackMessage isError>{error}</FeedbackMessage> :
         trades.length === 0 ? <FeedbackMessage>No trades found.</FeedbackMessage> :
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
              {trades.map(t => (
                <TableRow key={t.id}>
                  <TableCell>{formatTimestamp(t.timestamp)}</TableCell>
                  <TableCell>{t.user}</TableCell>
                  <TableCell>{t.symbol}</TableCell>
                  <TableCell><ActionBadge action={t.action}>{t.action}</ActionBadge></TableCell>
                  <TableCell>{t.quantity}</TableCell>
                  <TableCell>${formatPrice(t.price)}</TableCell>
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
         </>}
      </TableContainer>
    </MainContent>
  );
}
