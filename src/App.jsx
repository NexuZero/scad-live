import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import ProjectDashboard from './components/ProjectDashboard';
import EnumeratorList from './components/EnumeratorList';
import EconomicProjectList from './components/EconomicProjectList';
import EconomicProjectCreate from './components/EconomicProjectCreate';
import EconomicProjectDetail from './components/EconomicProjectDetail';
import LiveMap from './components/LiveMap';
import TasksPage from './components/pages/TasksPage';
import ChatPage from './components/pages/ChatPage';
import UsersPage from './components/pages/UsersPage';
import SettingsPage from './components/pages/SettingsPage';
import { NotificationBar } from './components/NotificationBar';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/layout/Sidebar';
import { isAuthenticated, getStoredRole } from './api';

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    if (process.env.NODE_ENV === 'development' && !process.env.REACT_APP_API_BASE_URL) {
      localStorage.setItem('access_token', 'dev_token');
      localStorage.setItem('user_role', 'admin');
      localStorage.setItem('user_name', 'Dev Admin');
    } else {
      return <Navigate to="/login" replace />;
    }
  }
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
}

function RoleRoute({ children, roles }) {
  const role = getStoredRole();
  if (roles && !roles.includes(role)) return <Navigate to="/" replace />;
  return children;
}

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );

  return (
    <div style={styles.appRoot}>
      <Sidebar onCollapseChange={setSidebarCollapsed} />

      <div style={{
        ...styles.mainColumn,
        marginLeft: sidebarCollapsed ? '60px' : '220px',
      }}>
        <NotificationBar />
        <main style={styles.main}>
          <Routes>
            <Route path="/"         element={<ErrorBoundary fallbackLabel="Dashboard failed to load."><ProjectDashboard /></ErrorBoundary>} />
            <Route path="/live"     element={<ErrorBoundary fallbackLabel="Live Map failed to load."><LiveMap /></ErrorBoundary>} />
            <Route path="/surveys"  element={<ErrorBoundary fallbackLabel="Surveys failed to load."><EconomicProjectList /></ErrorBoundary>} />
            <Route path="/surveys/new"         element={<ErrorBoundary><EconomicProjectCreate /></ErrorBoundary>} />
            <Route path="/surveys/:projectId"  element={<ErrorBoundary><EconomicProjectDetail /></ErrorBoundary>} />
            <Route path="/enumerators" element={<ErrorBoundary fallbackLabel="Enumerators failed to load."><EnumeratorList /></ErrorBoundary>} />
            <Route path="/tasks"   element={<RoleRoute roles={['admin','project_manager','supervisor']}><ErrorBoundary fallbackLabel="Tasks failed to load."><TasksPage /></ErrorBoundary></RoleRoute>} />
            <Route path="/chat"    element={<ErrorBoundary fallbackLabel="Chat failed to load."><ChatPage /></ErrorBoundary>} />
            <Route path="/users"   element={<RoleRoute roles={['admin']}><ErrorBoundary fallbackLabel="Users page failed to load."><UsersPage /></ErrorBoundary></RoleRoute>} />
            <Route path="/settings" element={<ErrorBoundary fallbackLabel="Settings failed to load."><SettingsPage /></ErrorBoundary>} />
            <Route path="*"        element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*"     element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

const styles = {
  appRoot: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-primary)',
  },
  mainColumn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: 'margin-left 200ms cubic-bezier(0.0, 0.0, 0.2, 1)',
    minWidth: 0,
  },
  main: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'var(--bg-primary)',
    transition: 'background-color 0.3s ease',
  },
};
