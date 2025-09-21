import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import ManageUser from "./pages/ManageUser";
import AITradeMonitor from "./pages/AITradeMonitor";
import ModelPerformanceComparison from "./pages/ModelPerformanceComparison";
import MarketTrendAnalysis from "./pages/MarketTrendAnalysis";
import Dashboard from "./pages/Dashboard";
import AdminLayout from "./components/AdminLayout";

function App() {
  return (
    <Router>
      <Routes>
        {/* หน้า Login อยู่นอก Layout */}
        <Route path="/" element={<Login />} />

        {/* หน้าภายใต้ AdminLayout */}
        <Route element={<AdminLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />

          {/* ใช้ /market-trend เป็นหลัก + alias /market-trend-analysis */}
          <Route path="/market-trend" element={<MarketTrendAnalysis />} />
          <Route path="/market-trend-analysis" element={<MarketTrendAnalysis />} />

          <Route path="/model-performance-comparison" element={<ModelPerformanceComparison />} />
          <Route path="/ai-trade-monitoring" element={<AITradeMonitor />} />
          <Route path="/manageuser" element={<ManageUser />} />

          {/* กันพิมพ์ผิด -> กลับ Dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
