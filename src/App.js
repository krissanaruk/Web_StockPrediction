import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import ManageUser from "./pages/ManageUser";
import AITradeMonitor from "./pages/AITradeMonitor";
import UserTradeHistory from "./pages/UserTradeHistory";
import ModelPerformanceComparison from "./pages/ModelPerformanceComparison";
import MarketTrendAnalysis from "./pages/MarketTrendAnalysis";
import Dashboard from "./pages/Dashboard";
import AdminLayout from "./components/AdminLayout";

/** 
 * เช็ค token: 
 * - ถ้ามี -> เข้า Overview (/dashboard)
 * - ถ้าไม่มี -> อยู่หน้า Login
 */
const RootGate = () => {
  const token = localStorage.getItem("adminToken");
  return token ? <Navigate to="/dashboard" replace /> : <Login />;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* หน้า root จะให้ RootGate ตัดสินใจ */}
        <Route path="/" element={<RootGate />} />

        {/* หน้าภายใต้ AdminLayout (ต้องมี token — AdminLayout มีเช็คอยู่แล้ว) */}
        <Route element={<AdminLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />

          {/* ใช้ /market-trend เป็นหลัก + alias /market-trend-analysis */}
          <Route path="/market-trend" element={<MarketTrendAnalysis />} />
          <Route path="/market-trend-analysis" element={<MarketTrendAnalysis />} />

          <Route path="/model-performance-comparison" element={<ModelPerformanceComparison />} />

          {/* ประวัติเทรด */}
          <Route path="/ai-trade-monitoring" element={<AITradeMonitor />} />
          <Route path="/user-trade-history" element={<UserTradeHistory />} />

          <Route path="/manageuser" element={<ManageUser />} />

          {/* กันพิมพ์ผิด (ภายใต้ Layout) -> กลับ Dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>

        {/* กันพิมพ์ผิด (นอก Layout) -> กลับ Dashboard (จะเด้ง Login ถ้าไม่มี token) */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
