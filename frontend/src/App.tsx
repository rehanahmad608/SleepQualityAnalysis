import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import OverviewPage from './pages/OverviewPage';
import DailyPage from './pages/DailyPage';
import SleepPage from './pages/SleepPage';
import WeeklyPage from './pages/WeeklyPage';
import ComparisonPage from './pages/ComparisonPage';
import DataManagementPage from './pages/DataManagementPage';
import ParticipantDataPage from './pages/ParticipantDataPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ParticipantDataPage />} />
        <Route path="/participant-data" element={<ParticipantDataPage />} />
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/daily" element={<ParticipantDataPage key="daily" initialPeriod="day" title="Daily View" />} />
        <Route path="/night" element={<ParticipantDataPage key="night" initialPeriod="night" title="Night View" />} />
        <Route path="/sleep" element={<Navigate to="/night" replace />} />
        <Route path="/weekly" element={<ParticipantDataPage key="weekly" initialView="weekly" title="Weekly View" />} />
        <Route path="/study/daily" element={<DailyPage />} />
        <Route path="/study/sleep" element={<SleepPage />} />
        <Route path="/study/weekly" element={<WeeklyPage />} />
        <Route path="/comparison" element={<ComparisonPage />} />
        <Route path="/data" element={<DataManagementPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
