import { useState } from 'react';
import { Outlet } from 'react-router';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import { useAuth } from '../../auth/AuthContext.js';
import styles from './AppShell.module.css';

// Layout route of everything under /app: the sidebar and header stay, the page
// (analysis, plans, ...) is whatever route matched.
function AppShell() {
  const { user, logout } = useAuth();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError('');
    try {
      // On success the auth state flips and <RequireAuth> sends the visitor to /login.
      await logout();
    } catch {
      setLogoutError('Não foi possível sair agora. Tente novamente.');
      setLoggingOut(false);
    }
  }

  return (
    <div className={styles.shell}>
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={user}
        onLogout={handleLogout}
        loggingOut={loggingOut}
        logoutError={logoutError}
      />
      <div className={styles.main}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className={styles.content}><Outlet /></main>
      </div>
    </div>
  );
}

export default AppShell;
