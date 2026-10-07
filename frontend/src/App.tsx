import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import OverviewPage from './pages/OverviewPage';
import DailyPage from './pages/DailyPage';
import SleepPage from './pages/SleepPage';
import WeeklyPage from './pages/WeeklyPage';
import ComparisonPage from './pages/ComparisonPage';
import DataManagementPage from './pages/DataManagementPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="/daily" element={<DailyPage />} />
        <Route path="/sleep" element={<SleepPage />} />
        <Route path="/weekly" element={<WeeklyPage />} />
        <Route path="/comparison" element={<ComparisonPage />} />
        <Route path="/data" element={<DataManagementPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
