import { useState } from 'react';
import Sidebar from './Sidebar.jsx';
import Header from './Header.jsx';
import styles from './AppShell.module.css';

function AppShell({
  children, activeView, onNavigate, onLogout,
}) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeView={activeView}
        onNavigate={(view) => { onNavigate(view); setSidebarOpen(false); }}
        onLogout={onLogout}
      />
      <div className={styles.main}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
