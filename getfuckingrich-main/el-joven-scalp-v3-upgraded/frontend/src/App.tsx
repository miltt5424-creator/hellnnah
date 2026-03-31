import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import JournalPage from "./pages/JournalPage";
import PricingPage from "./pages/PricingPage";
import LandingPage from "./pages/LandingPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAlerts } from "./hooks/useAlerts";
import Sidebar from "./components/layout/Sidebar";
import { useIsMobile } from "./hooks/useIsMobile";
import TopBar from "./components/layout/TopBar";
import StatusBar from "./components/layout/StatusBar";
import AlertToast from "./components/alerts/AlertToast";

function AppLayout() {
  const { status } = useWebSocket();
  useAlerts();
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <TopBar wsStatus={status} />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {!isMobile && <Sidebar />}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
      <StatusBar wsStatus={status} />
      <AlertToast />
    </div>
  );
}

function LoginWrapper() {
  const navigate = useNavigate();
  return <LoginPage onLogin={() => navigate("/dashboard")} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginWrapper />} />
        <Route path="/*" element={<AppLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
