import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import axios from 'axios';

// === API Config ===
const API_URL = 'http://localhost:3000/api/admin';
const getAuthHeaders = () => {
  const token = localStorage.getItem('adminToken');
  return { headers: { Authorization: `Bearer ${token}` } };
};

// --- Styled Components for Page Content (เหมือนเดิม) ---
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

function ManageUser() {
  const [users, setUsers] = useState([]);
  const [userToEdit, setUserToEdit] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [editedUser, setEditedUser] = useState({ username: '', email: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  // pagination (รองรับจาก API; UI ยังไม่มีกดหน้า ถ้าจะเพิ่มค่อยต่อยอด)
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
      // map field -> UI
      const mapped = rows.map(u => ({
        id: u.UserID,
        name: u.Username,
        email: u.Email,
        role: u.Role,             // เผื่อใช้ต่อ
        status: u.Status || 'active', // API ใช้ตัวพิมพ์เล็ก
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
    // payload: { username, email }
    const res = await axios.put(`${API_URL}/users/${userId}`, payload, getAuthHeaders());
    return res.data?.data; // ถ้าคุณปรับให้คืน row ล่าสุดตามที่แนะนำไว้
  };

  const updateUserStatusAPI = async (userId, newStatus) => {
    // newStatus: 'active' | 'suspended'
    await axios.put(`${API_URL}/users/${userId}/status`, { status: newStatus }, getAuthHeaders());
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // โหลดครั้งแรก

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

      if (Object.keys(body).length === 0) {
        setUserToEdit(null);
        return;
      }

      // call API
      await saveUserEditAPI(userToEdit.id, body);

      // update UI
      const updatedUsers = users.map(u =>
        u.id === userToEdit.id ? { ...u, name: editedUser.username, email: editedUser.email } : u
      );
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
      const updatedUsers = users.map(u =>
        u.id === user.id ? { ...u, status: newStatus } : u
      );
      setUsers(updatedUsers);
      setActionModal(null);
      alert(`User ${action}d successfully!`);
    } catch (err) {
      console.error('Error updating user status:', err);
      alert(err?.response?.data?.error || 'Failed to update user status.');
    }
  };

  const displayStatusText = (status) =>
    (status?.toLowerCase() === 'active' ? 'Active' : 'ระงับ');

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
                      <ActionButton className="edit" onClick={() => handleEdit(user)}>
                        แก้ไข
                      </ActionButton>
                      {(user.status || '').toLowerCase() === 'active' ? (
                        <ActionButton className="suspend" onClick={() => handleAction(user)}>
                          ระงับ
                        </ActionButton>
                      ) : (
                        <ActionButton className="activate" onClick={() => handleAction(user)}>
                          เปิดใช้งาน
                        </ActionButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </UserTable>
          )}
        </TableContainer>
      </MainContent>

      {userToEdit && (
        <ModalOverlay>
          <ModalContent>
            <ModalTitle>แก้ไขผู้ใช้</ModalTitle>
            <div>
              <label>Name</label>
              <ModalInput
                type="text"
                value={editedUser.username}
                onChange={(e) => setEditedUser({ ...editedUser, username: e.target.value })}
              />
            </div>
            <div>
              <label>Email</label>
              <ModalInput
                type="email"
                value={editedUser.email}
                onChange={(e) => setEditedUser({ ...editedUser, email: e.target.value })}
              />
            </div>
            <ModalButtonContainer>
              <ModalButton className="cancel" onClick={() => setUserToEdit(null)}>
                ยกเลิก
              </ModalButton>
              <ModalButton className="save" onClick={handleSaveEdit}>
                บันทึกการเปลี่ยนแปลง
              </ModalButton>
            </ModalButtonContainer>
          </ModalContent>
        </ModalOverlay>
      )}

      {actionModal && (
        <ModalOverlay>
          <ModalContent>
            <ModalTitle>
              {actionModal.action === 'suspend' ? 'ยืนยันการระงับบัญชี' : 'ยืนยันการเปิดใช้งานบัญชี'}
            </ModalTitle>
            <p>
              {actionModal.action === 'suspend'
                ? `คุณแน่ใจหรือไม่ว่าต้องการระงับบัญชีของ ${actionModal.user.name}?`
                : `คุณแน่ใจหรือไม่ว่าต้องการเปิดใช้งานบัญชีของ ${actionModal.user.name}?`}
            </p>
            <ModalButtonContainer>
              <ModalButton className="cancel" onClick={() => setActionModal(null)}>
                ยกเลิก
              </ModalButton>
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
    </>
  );
}

export default ManageUser;
