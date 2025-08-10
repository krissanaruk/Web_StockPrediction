  const apiStatus = newStatus === 'Active' ? 'active' : 'deactivated';
  return await axios.put(`${API_URL}/users/${userId}/status`, { status: apiStatus }, getAuthHeaders());
};

/**
 * บันทึกการแก้ไขข้อมูลผู้ใช้ (Username, Email)
 * @param {string|number} userId - ID ของผู้ใช้
 * @param {object} userData - ข้อมูลผู้ใช้ที่จะอัปเดต. e.g., { name: 'New Name', email: 'new@email.com' }
 */
export const saveUserEditAPI = async (userId, userData) => {
  // แปลง key จาก 'name' (ที่ใช้ใน Frontend) เป็น 'username' (ที่ API ต้องการ)
  const apiData = {
    username: userData.name,
    email: userData.email,
  };

  return await axios.put(`${API_URL}/users/${userId}`, apiData, getAuthHeaders());
};

