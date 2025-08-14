// ManageUser.js
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import axios from 'axios';

// === API Config ===
const API_URL = 'http://localhost:3000/api/admin';
const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

// --- Styled Components (คงธีม/สไตล์เดิม) ---
const MainContent = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center;
  overflow-y: auto; padding: 20px; color: #e0e0e0;
`;
const Header = styled.header`
  width: 100%; background: #ff8c00; padding: 15px; text-align: center; color: white;
  font-size: 28px; font-weight: bold; box-shadow: 0 4px 8px rgba(255,140,0,0.4);
  border-radius: 10px; margin-bottom: 20px;
`;
const TableContainer = styled.div`
  background: #1e1e1e; padding: 20px; border-radius: 10px; width: 100%;
  max-width: 1200px; box-shadow: 0 5px 15px rgba(0,0,0,0.3);
`;
const UserTable = styled.table` width: 100%; border-collapse: collapse; `;
const TableHead = styled.thead`
  th { padding: 12px 15px; text-align: left; font-weight: bold; color: #ff8c00;
       border-bottom: 2px solid #ff8c00; text-transform: uppercase; font-size: 14px; }
`;
const TableRow = styled.tr`
  border-bottom: 1px solid #333; &:hover { background-color: #2a2a2a; }
`;
const TableCell = styled.td` padding: 12px 15px; `;
const StatusBadge = styled.span`
  padding: 5px 12px; border-radius: 15px; font-size: 12px; font-weight: bold; color: #111;
  background-color: ${props => (props.active ? '#28a745' : '#dc3545')};
`;
const ActionButton = styled.button`
  padding: 8px 12px; border: none; border-radius: 5px; cursor: pointer; color: white;
  font-weight: bold; margin: 0 5px; transition: background-color 0.3s;
  &.view { background-color: #ff8c00; &:hover { filter: brightness(0.95); } }
  &.edit { background-color: #007bff; &:hover { background-color: #0056b3; } }
  &.suspend { background-color: #dc3545; &:hover { background-color: #c82333; } }
  &.activate { background-color: #28a745; &:hover { background-color: #218838; } }
`;
const ModalOverlay = styled.div`
  position: fixed; inset: 0; background-color: rgba(0,0,0,0.75);
  display: flex; justify-content: center; align-items: center; z-index: 50;
`;
const ModalContent = styled.div`
  background: #1e1e1e; padding: 30px; border-radius: 12px; box-shadow: 0 5px 20px rgba(0,0,0,0.2);
  width: 100%; max-width: 500px; border: 1px solid rgba(255,255,255,0.2);
`;
const ModalTitle = styled.h2`
  color: #ff8c00; font-size: 22px; font-weight: bold; margin: 0 0 20px 0;
`;
const ModalInput = styled.input`
  width: calc(100% - 24px); padding: 12px; margin-bottom: 15px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.3); outline: none; background: #333; color: white; font-size: 16px;
`;
const ModalButtonContainer = styled.div` display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; `;
const ModalButton = styled.button`
  padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; color: white; font-weight: bold;
  transition: background-color 0.3s;
  &.save { background-color: #28a745; &:hover { background-color: #218838; } }
  &.cancel { background-color: #6c757d; &:hover { background-color: #5a6268; } }
  &.confirm-suspend { background-color: #dc3545; &:hover { background-color: #c82333; } }
  &.confirm-activate { background-color: #28a745; &:hover { background-color: #218838; } }
`;
const FeedbackMessage = styled.p`
  text-align: center; padding: 40px 20px; font-size: 18px;
  color: ${props => (props.isError ? '#dc3545' : '#a0a0a0')};
`;

/* ===== Drawer ===== */
const Drawer = styled.div`
  position: fixed; top: 0; right: 0; bottom: 0; width: 520px; max-width: 95vw;
  background: #222; border-left: 1px solid #333;
  box-shadow: -14px 0 28px rgba(0,0,0,.45);
  z-index: 60; display: flex; flex-direction: column;
`;
const DrawerHeader = styled.div`
  display: flex; align-items: center; gap: 10px; padding: 16px 18px;
  background: #1e1e1e; border-bottom: 1px solid #333;
`;
const DrawerTitle = styled.h3` margin: 0; color: #ff8c00; font-size: 20px; font-weight: 800; `;
const DrawerBody = styled.div` padding: 16px 18px; overflow:auto; flex:1; `;
const DrawerClose = styled.button`
  margin-left: auto; background: transparent; border: 1px solid #333; color: #eee; padding: 8px 10px; 
  border-radius: 8px; cursor: pointer;
  &:hover { background: #2a2a2a; }
`;
const SectionCard = styled.div`
  background:#1e1e1e; border:1px solid #2a2a2a; border-radius: 10px; padding: 12px; margin-bottom: 12px;
`;
const SectionTitle = styled.div` font-weight: 800; margin-bottom: 6px; `;
const Key = styled.div` font-size: 12px; color:#9a9a9a; `;
const Val = styled.div` font-weight: 700; `;
const Tag = styled.span`
  display:inline-block; padding:6px 10px; border-radius:999px; font-size:12px; 
  background:#262626; border:1px solid #333; color:#cfcfcf; margin-left:8px;
`;
const MiniTable = styled.table`
  width: 100%; border-collapse: collapse; margin-top: 8px;
  th { text-align:left; padding: 8px; font-size:12px; color:#ff8c00; border-bottom: 1px solid #333; }
  td { padding: 8px; border-bottom: 1px solid #2c2c2c; font-size: 14px; }
`;

// =================== Component ===================
function ManageUser() {
  const [users, setUsers] = useState([]);
  const [userToEdit, setUserToEdit] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [editedUser, setEditedUser] = useState({ username: '', email: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Drawer states
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null); // {Username, Email, Role, Status, HoldingsSimple: [...]}

  // pagination (เผื่อใช้ต่อยอด)
  const [page] = useState(1);
  const [limit] = useState(20);
  const [search] = useState('');

  // === API calls ===
  const fetchUsers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const url = `${API_URL}/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
      const res = await axios.get(url, getAuthHeaders());
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      const mapped = rows.map(u => ({
        id: u.UserID,
        name: u.Username,
        email: u.Email,
        role: u.Role,
        status: u.Status || 'active',
      }));
      setUsers(mapped);
    } catch (err) {
      console.error('Fetch users error:', err);
      setError(err?.response?.data?.error || 'Failed to load users.');
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveUserEditAPI = async (userId, payload) => {
    const res = await axios.put(`${API_URL}/users/${userId}`, payload, getAuthHeaders());
    return res.data?.data;
  };

  const updateUserStatusAPI = async (userId, newStatus) => {
    await axios.put(`${API_URL}/users/${userId}/status`, { status: newStatus }, getAuthHeaders());
  };

  // ✅ ใช้ endpoint ที่คุณมีจริง: holdings-simple
  const fetchUserHoldingsSimple = async (userObj) => {
    setDetailLoading(true);
    setDetailData(null);
    try {
      const url = `${API_URL}/users/${userObj.id}/holdings-simple?page=1&limit=200`;
      const res = await axios.get(url, getAuthHeaders());
      const holdings = res.data?.data || [];

      // group ตาม PaperPortfolioID (ให้ Drawer อ่านง่ายขึ้น)
      const grouped = holdings.reduce((acc, h) => {
        const pid = h.PaperPortfolioID || 'unknown';
        if (!acc[pid]) acc[pid] = [];
        acc[pid].push(h);
        return acc;
      }, {});

      setDetailData({
        Username: userObj.name,
        Email: userObj.email,
        Role: userObj.role,
        Status: userObj.status,
        HoldingsSimple: holdings,
        HoldingsByPortfolio: grouped,
        Pagination: res.data?.pagination
      });
    } catch (e) {
      console.error(e);
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []); // โหลดครั้งแรก

  const handleEdit = (user) => {
    setUserToEdit(user);
    setEditedUser({ username: user.name, email: user.email });
  };

  const handleSaveEdit = async () => {
    if (!userToEdit) return;
    try {
      const body = {};
      if (editedUser.username && editedUser.username !== userToEdit.name) body.username = editedUser.username;
      if (editedUser.email && editedUser.email !== userToEdit.email) body.email = editedUser.email;
      if (Object.keys(body).length === 0) { setUserToEdit(null); return; }
      await saveUserEditAPI(userToEdit.id, body);
      const updatedUsers = users.map(u => u.id === userToEdit.id ? { ...u, name: editedUser.username, email: editedUser.email } : u);
      setUsers(updatedUsers);
      setUserToEdit(null);
      alert('User updated successfully!');
    } catch (err) {
      console.error('Error updating user:', err);
      alert(err?.response?.data?.error || 'Failed to update user.');
    }
  };

  const handleAction = (user) => {
    const action = user.status?.toLowerCase() === 'active' ? 'suspend' : 'activate';
    setActionModal({ user, action });
  };

  const handleConfirmAction = async () => {
    if (!actionModal) return;
    const { user, action } = actionModal;
    const newStatus = action === 'suspend' ? 'suspended' : 'active';
    try {
      await updateUserStatusAPI(user.id, newStatus);
      const updatedUsers = users.map(u => u.id === user.id ? { ...u, status: newStatus } : u);
      setUsers(updatedUsers);
      setActionModal(null);
      alert(`User ${action}d successfully!`);
    } catch (err) {
      console.error('Error updating user status:', err);
      alert(err?.response?.data?.error || 'Failed to update user status.');
    }
  };

  const displayStatusText = (status) => (status?.toLowerCase() === 'active' ? 'Active' : 'ระงับ');

  // 🔎 ดูข้อมูล (เปิด Drawer + โหลด holdings-simple)
  const handleView = async (user) => {
    setDetailOpen(true);
    await fetchUserHoldingsSimple(user);
  };

  return (
    <>
      <MainContent>
        <Header>การจัดการผู้ใช้</Header>
        <TableContainer>
          {isLoading ? (
            <FeedbackMessage>Loading users...</FeedbackMessage>
          ) : error ? (
            <FeedbackMessage isError>{error}</FeedbackMessage>
          ) : users.length === 0 ? (
            <FeedbackMessage>No users found.</FeedbackMessage>
          ) : (
            <UserTable>
              <TableHead>
                <tr>
                  <th>User</th>
                  <th>Email</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </TableHead>
              <tbody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      <StatusBadge active={(user.status || '').toLowerCase() === 'active'}>
                        {displayStatusText(user.status)}
                      </StatusBadge>
                    </TableCell>
                    <TableCell style={{ textAlign: 'center' }}>
                      <ActionButton className="view" onClick={() => handleView(user)}>ดูข้อมูล</ActionButton>
                      <ActionButton className="edit" onClick={() => handleEdit(user)}>แก้ไข</ActionButton>
                      {(user.status || '').toLowerCase() === 'active' ? (
                        <ActionButton className="suspend" onClick={() => handleAction(user)}>ระงับ</ActionButton>
                      ) : (
                        <ActionButton className="activate" onClick={() => handleAction(user)}>เปิดใช้งาน</ActionButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </UserTable>
          )}
        </TableContainer>
      </MainContent>

      {/* ===== Modal: แก้ไขผู้ใช้ ===== */}
      {userToEdit && (
        <ModalOverlay>
          <ModalContent>
            <ModalTitle>แก้ไขผู้ใช้</ModalTitle>
            <div>
              <label>Name</label>
              <ModalInput type="text" value={editedUser.username}
                onChange={(e) => setEditedUser({ ...editedUser, username: e.target.value })}/>
            </div>
            <div>
              <label>Email</label>
              <ModalInput type="email" value={editedUser.email}
                onChange={(e) => setEditedUser({ ...editedUser, email: e.target.value })}/>
            </div>
            <ModalButtonContainer>
              <ModalButton className="cancel" onClick={() => setUserToEdit(null)}>ยกเลิก</ModalButton>
              <ModalButton className="save" onClick={handleSaveEdit}>บันทึกการเปลี่ยนแปลง</ModalButton>
            </ModalButtonContainer>
          </ModalContent>
        </ModalOverlay>
      )}

      {/* ===== Modal: ยืนยันระงับ/เปิดใช้งาน ===== */}
      {actionModal && (
        <ModalOverlay>
          <ModalContent>
            <ModalTitle>{actionModal.action === 'suspend' ? 'ยืนยันการระงับบัญชี' : 'ยืนยันการเปิดใช้งานบัญชี'}</ModalTitle>
            <p>
              {actionModal.action === 'suspend'
                ? `คุณแน่ใจหรือไม่ว่าต้องการระงับบัญชีของ ${actionModal.user.name}?`
                : `คุณแน่ใจหรือไม่ว่าต้องการเปิดใช้งานบัญชีของ ${actionModal.user.name}?`}
            </p>
            <ModalButtonContainer>
              <ModalButton className="cancel" onClick={() => setActionModal(null)}>ยกเลิก</ModalButton>
              <ModalButton
                className={actionModal.action === 'suspend' ? 'confirm-suspend' : 'confirm-activate'}
                onClick={handleConfirmAction}
              >
                {actionModal.action === 'suspend' ? 'ระงับ' : 'เปิดใช้งาน'}
              </ModalButton>
            </ModalButtonContainer>
          </ModalContent>
        </ModalOverlay>
      )}

      {/* ===== Drawer: รายละเอียดผู้ใช้ + Holdings (simple) ===== */}
      {detailOpen && (
        <Drawer>
          <DrawerHeader>
            <DrawerTitle>รายละเอียดผู้ใช้</DrawerTitle>
            <DrawerClose onClick={() => setDetailOpen(false)}>ปิด</DrawerClose>
          </DrawerHeader>
          <DrawerBody>
            {detailLoading && <FeedbackMessage>กำลังโหลดข้อมูล...</FeedbackMessage>}
            {!detailLoading && !detailData && <FeedbackMessage isError>ไม่พบข้อมูล</FeedbackMessage>}

            {!detailLoading && detailData && (
              <>
                <SectionCard>
                  <SectionTitle>ข้อมูลทั่วไป</SectionTitle>
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                    <div><Key>Username</Key><Val>{detailData.Username}</Val></div>
                    <div><Key>Email</Key><Val>{detailData.Email}</Val></div>
                    <div><Key>Role</Key><Val>{detailData.Role}</Val></div>
                    <div>
                      <Key>Status</Key>
                      <Val>
                        <StatusBadge active={(detailData.Status || '').toLowerCase() === 'active'}>
                          {detailData.Status}
                        </StatusBadge>
                      </Val>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionTitle>
                    รายการถือครอง (Simple)
                    <Tag>{(detailData.HoldingsSimple || []).length} รายการ</Tag>
                  </SectionTitle>

                  {/* จัดกลุ่มตาม Portfolio */}
                  {Object.entries(detailData.HoldingsByPortfolio || {}).map(([pid, list]) => (
                    <SectionCard key={pid} style={{ marginBottom: 8 }}>
                      <div style={{fontWeight:800, marginBottom:6}}>Portfolio ID: {pid}</div>
                      <MiniTable>
                        <thead>
                          <tr>
                            <th>SYMBOL</th>
                            <th>QTY</th>
                            <th>BUY PRICE</th>
                            <th>PAPER HOLDING ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map(h => (
                            <tr key={h.PaperHoldingID}>
                              <td>{h.StockSymbol}</td>
                              <td>{Number(h.Quantity).toLocaleString()}</td>
                              <td>{Number(h.BuyPrice).toLocaleString()}</td>
                              <td>{h.PaperHoldingID}</td>
                            </tr>
                          ))}
                        </tbody>
                      </MiniTable>
                    </SectionCard>
                  ))}

                  {(detailData.HoldingsSimple || []).length === 0 && (
                    <FeedbackMessage>ยังไม่มีรายการถือครอง</FeedbackMessage>
                  )}
                </SectionCard>
              </>
            )}
          </DrawerBody>
        </Drawer>
      )}
    </>
  );
}

export default ManageUser;
