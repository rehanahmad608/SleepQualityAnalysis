import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import OverviewPage from './pages/OverviewPage';
import DailyPage from './pages/DailyPage';
import SleepPage from './pages/SleepPage';
import WeeklyPage from './pages/WeeklyPage';
import ComparisonPage from './pages/ComparisonPage';
import DataManagementPage from './pages/DataManagementPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardAuth from './auth/DashboardAuth';
import ReferenceDashboardPage from './pages/ReferenceDashboardPage';

function GoogleCallbackRedirect() {
  return <Navigate to={window.location.pathname === '/auth/callback' ? '/' : window.location.pathname + window.location.search + window.location.hash} replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Authentication pages render outside the dashboard layout: no study/participant requests. */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<DashboardAuth />}>
      <Route path="/auth/callback" element={<GoogleCallbackRedirect />} />
      <Route index element={<ReferenceDashboardPage />} />
      <Route path="/participant-data" element={<ReferenceDashboardPage />} />
      <Route path="/daily" element={<ReferenceDashboardPage key="daily-design" initialView="day" />} />
      <Route path="/night" element={<ReferenceDashboardPage key="night-design" initialView="day" />} />
      <Route path="/weekly" element={<ReferenceDashboardPage key="weekly-design" />} />
      <Route path="/sleep" element={<Navigate to="/night" replace />} />
      <Route element={<Layout />}>
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/study/daily" element={<DailyPage />} />
        <Route path="/study/sleep" element={<SleepPage />} />
        <Route path="/study/weekly" element={<WeeklyPage />} />
        <Route path="/comparison" element={<ComparisonPage />} />
        <Route path="/data" element={<DataManagementPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      </Route>
    </Routes>
  );
}
