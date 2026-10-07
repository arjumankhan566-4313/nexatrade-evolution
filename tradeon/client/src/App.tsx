import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ApexLandingPage from './apex/pages/ApexLandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ChartPage from './pages/ChartPage';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import TerminalPage from './pages/dashboard/TerminalPage';
import HistoryPage from './pages/dashboard/HistoryPage';
import WalletPage from './pages/dashboard/WalletPage';
import AffiliatePage from './pages/dashboard/AffiliatePage';
import KycPage from './pages/dashboard/KycPage';
import SecurityPage from './pages/dashboard/SecurityPage';
import SupportChatPage from './pages/dashboard/SupportChatPage';
import CopyTradingPage from './pages/dashboard/CopyTradingPage';
import TournamentsPage from './pages/dashboard/TournamentsPage';
import ChartLabPage from './pages/dashboard/ChartLabPage';
import MultiChartPage from './pages/dashboard/MultiChartPage';
import LegacyToast from './components/LegacyToast';
import LegacyModal from './components/LegacyModal';
// ── Admin Panel (STANDALONE — separate from the user /dashboard shell) ──
import AdminLayout from './pages/admin/AdminLayout';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminRiskPage from './pages/admin/AdminRiskPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminKycPage from './pages/admin/AdminKycPage';
import AdminFinancePage from './pages/admin/AdminFinancePage';
import AdminAffiliatePage from './pages/admin/AdminAffiliatePage';
import AdminOtcPage from './pages/admin/AdminOtcPage';
import AdminFraudPage from './pages/admin/AdminFraudPage';
import AdminLogsPage from './pages/admin/AdminLogsPage';
import AdminPromosPage from './pages/admin/AdminPromosPage';
import AdminSupportPage from './pages/admin/AdminSupportPage';
import AdminDatabasePage from './pages/admin/AdminDatabasePage';
import AdminPerformancePage from './pages/admin/AdminPerformancePage';
import { useAuthStore } from './stores/authStore';

// SPA routing — fully separate from the legacy Next.js routes.
// The Admin Panel lives under /admin and has its OWN shell, completely
// isolated from the user /dashboard shell (no shared sidebar/topbar).
export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <>
    <LegacyToast />
    <LegacyModal />
    <Routes>
      {/* Apex Blueprint landing — the public marketing surface. */}
      <Route path="/" element={<ApexLandingPage />} />
      {/* Module 1 wiring smoke page, kept reachable for diagnostics. */}
      <Route path="/status" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/chart" element={<ChartPage />} />
      {/* ── User Dashboard (authenticated shell + child pages) ── */}
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<TerminalPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="wallet" element={<WalletPage />} />
        <Route path="affiliate" element={<AffiliatePage />} />
        <Route path="kyc" element={<KycPage />} />
        <Route path="security" element={<SecurityPage />} />
        <Route path="chat" element={<SupportChatPage />} />
        <Route path="social" element={<CopyTradingPage />} />
        <Route path="tournaments" element={<TournamentsPage />} />
        <Route path="chart-lab" element={<ChartLabPage />} />
        <Route path="multi" element={<MultiChartPage />} />
        {/* Legacy /dashboard/admin → redirect to the standalone admin panel */}
        <Route path="admin" element={<Navigate to="/admin" replace />} />
      </Route>
      {/* ── Admin Panel (standalone shell, separate origin from /dashboard) ── */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="kyc" element={<AdminKycPage />} />
        <Route path="finance" element={<AdminFinancePage />} />
        <Route path="affiliate" element={<AdminAffiliatePage />} />
        <Route path="risk" element={<AdminRiskPage />} />
        <Route path="otc" element={<AdminOtcPage />} />
        <Route path="promos" element={<AdminPromosPage />} />
        <Route path="support" element={<AdminSupportPage />} />
        <Route path="fraud" element={<AdminFraudPage />} />
        <Route path="logs" element={<AdminLogsPage />} />
        <Route path="database" element={<AdminDatabasePage />} />
        <Route path="performance" element={<AdminPerformancePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
