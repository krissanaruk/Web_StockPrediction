import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import ManageUser from "./pages/ManageUser";
import AITradeMonitor from "./pages/AITradeMonitor"; // Import หน้าใหม่
import ModelPerformanceComparison from "./pages/ModelPerformanceComparison"; // Import หน้าใหม่
import MarketTrendAnalysis from "./pages/MarketTrendAnalysis";
import Dashboard from "./pages/Dashboard";
import AdminLayout from "./components/AdminLayout"; // 1. Import Layout จากที่ที่ถูกต้อง

function App() {
  return (
    <Router>
      <Routes>
        {/* 2. Route ของหน้า Login จะอยู่นอก Layout */}
        <Route path="/" element={<Login />} />

        {/* 3. สร้าง Route ที่ครอบหน้าอื่นๆ ด้วย AdminLayout */}
        <Route element={<AdminLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/market-trend-analysis" element={<MarketTrendAnalysis />} />
          <Route path="/model-performance-comparison" element={<ModelPerformanceComparison />} />
          <Route path="/ai-trade-monitoring" element={<AITradeMonitor />} />
          <Route path="/manageuser" element={<ManageUser />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
