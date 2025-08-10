import React, { useEffect } from 'react';
import styled from 'styled-components';
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom';

const DashboardContainer = styled.div`
  display: flex;
  height: 100vh;
  background: #121212;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  overflow: hidden;
`;

const Sidebar = styled.div`
  width: 250px;
  background: #1e1e1e;
  padding: 20px;
  font-weight: bold;
  box-shadow: 4px 0 10px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const LogoLink = styled(Link)`
  text-decoration: none;
  color: inherit;
  margin-bottom: 10px;
`;

const SidebarNavLink = styled(NavLink)`
  color: #e0e0e0;
  text-decoration: none;
  padding: 10px 15px;
  border-radius: 8px;
  transition: background-color 0.3s, color 0.3s;

  &:hover {
    background-color: #333;
    color: #ff8c00;
  }

  &.active {
    background-color: #ff8c00;
    color: #1e1e1e;
  }
`;

const SidebarButton = styled.button`
  color: #e0e0e0;
  background: none;
  border: none;
  padding: 10px 15px;
  border-radius: 8px;
  transition: background-color 0.3s, color 0.3s;
  cursor: pointer;
  font-weight: bold;
  font-size: inherit;
  font-family: inherit;
  text-align: left;
  width: 100%;
  margin-top: auto; /* ดันปุ่มไปไว้ด้านล่างสุด */

  &:hover {
    background-color: #333;
    color: #ff8c00;
  }
`;

const PageContentContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

const AdminLayout = () => {
  const navigate = useNavigate();

  // ตรวจสอบ token เมื่อ component โหลด
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      console.log("No admin token found, redirecting to login.");
      navigate('/', { replace: true }); // ใช้ replace: true เพื่อไม่ให้ผู้ใช้กด back กลับมาได้
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');  
    navigate('/');
  };

  return (
    <DashboardContainer>
      <Sidebar>
        <LogoLink to="/dashboard">
          <h2 style={{ color: '#ff8c00', margin: 0 }}>📊 Admin Dashboard</h2>
        </LogoLink>
        <SidebarNavLink to="/dashboard" end>Overview</SidebarNavLink>
        <SidebarNavLink to="/manageuser">User Management</SidebarNavLink>
        <SidebarNavLink to="/ai-trade-monitoring">AI Trade Monitoring</SidebarNavLink>
        <SidebarNavLink to="/model-performance-comparison">Model Performance Comparison</SidebarNavLink>
        <SidebarNavLink to="/market-trend-analysis">Market Trend Analysis</SidebarNavLink>
        <SidebarButton onClick={handleLogout}>ออกจากระบบ</SidebarButton>
      </Sidebar>
      <PageContentContainer>
        <Outlet /> {/* คือตำแหน่งที่เนื้อหาของแต่ละหน้าจะถูกแสดงผล */}
      </PageContentContainer>
    </DashboardContainer>
  );
};

export default AdminLayout;
