import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ConversationsPage from './pages/ConversationsPage';
import KnowledgePage from './pages/KnowledgePage';
import IngestionPage from './pages/IngestionPage';
import CraftPage from './pages/CraftPage';
import ModelsPage from './pages/ModelsPage';
import LearningPage from './pages/LearningPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ClientsPage from './pages/ClientsPage';
import GovernancePage from './pages/GovernancePage';
import NotFoundPage from './pages/NotFoundPage';

function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RedirectIfAuthed({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthed>
            <LoginPage />
          </RedirectIfAuthed>
        }
      />
      <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/conversations" element={<RequireAuth><ConversationsPage /></RequireAuth>} />
      <Route path="/conversations/:id" element={<RequireAuth><ConversationsPage /></RequireAuth>} />
      <Route path="/knowledge" element={<RequireAuth><KnowledgePage /></RequireAuth>} />
      <Route path="/ingestion" element={<RequireAuth><IngestionPage /></RequireAuth>} />
      <Route path="/craft" element={<RequireAuth><CraftPage /></RequireAuth>} />
      <Route path="/models" element={<RequireAuth><ModelsPage /></RequireAuth>} />
      <Route path="/learning" element={<RequireAuth><LearningPage /></RequireAuth>} />
      <Route path="/analytics" element={<RequireAuth><AnalyticsPage /></RequireAuth>} />
      <Route path="/clients" element={<RequireAuth><ClientsPage /></RequireAuth>} />
      <Route path="/governance" element={<RequireAuth><GovernancePage /></RequireAuth>} />
      <Route path="*" element={<RequireAuth><NotFoundPage /></RequireAuth>} />
    </Routes>
  );
}
