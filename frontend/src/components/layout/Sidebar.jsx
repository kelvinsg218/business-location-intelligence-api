import { NavLink, useNavigate } from 'react-router';
import {
  Search, History, Compass, CreditCard, BookOpen, X, MapPinned, LogOut,
} from 'lucide-react';
import Badge from '../common/Badge.jsx';
import { API_BASE_URL } from '../../api/apiClient.js';
import styles from './Sidebar.module.css';

// Items with a `to` are real, working pages (routes under /app). Items without
// one are not built yet and stay disabled with a "soon" badge instead of
// pretending to work.
const NAV_ITEMS = [
  {
    id: 'analysis', label: 'Nova Análise', icon: Search, to: '/app', end: true,
  },
  {
    id: 'history', label: 'Histórico', icon: History, to: null,
  },
  {
    id: 'explore', label: 'Explorar', icon: Compass, to: null,
  },
  {
    id: 'plans', label: 'Planos', icon: CreditCard, to: '/app/plans',
  },
];

// Documentação links to the real Swagger UI the backend already serves —
// a genuine feature, not a placeholder for a page that doesn't exist yet.
const DOCS_URL = `${API_BASE_URL}/api-docs`;

function Sidebar({
  isOpen, onClose, user, onLogout, loggingOut, logoutError,
}) {
  const navigate = useNavigate();

  return (
    <>
      <div
        className={`${styles.backdrop} ${isOpen ? styles.backdropVisible : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`} aria-label="Navegação principal">
        <div className={styles.top}>
          <div className={styles.brand}>
            <MapPinned size={22} className={styles.brandIcon} aria-hidden="true" />
            <div>
              <p className={styles.brandLine1}>LOCATE</p>
              <p className={styles.brandLine2}>INTELLIGENCE</p>
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar menu">
            <X size={20} />
          </button>
        </div>

        <nav className={styles.nav} aria-label="Navegação principal">
          {NAV_ITEMS.map(({
            id, label, icon: Icon, to, end,
          }) => {
            if (to === null) {
              return (
                <button
                  key={id}
                  type="button"
                  className={styles.navItem}
                  disabled
                  title="Em breve"
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                  <Badge tone="muted">Em breve</Badge>
                </button>
              );
            }
            return (
              <NavLink
                key={id}
                to={to}
                end={end}
                onClick={onClose}
                className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            );
          })}

          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className={styles.navItem}
          >
            <BookOpen size={18} aria-hidden="true" />
            <span>Documentação</span>
          </a>
        </nav>

        <div className={styles.bottom}>
          <div className={styles.planCard}>
            <p className={styles.planLabel}>Plano atual</p>
            <p className={styles.planName}>Free</p>
            <button
              type="button"
              className={styles.planCta}
              onClick={() => { onClose(); navigate('/app/plans'); }}
            >
              Ver planos
            </button>
          </div>
          {user && <p className={styles.userName} title={user.email}>{user.name}</p>}
          <button type="button" className={styles.logoutButton} onClick={onLogout} disabled={loggingOut}>
            <LogOut size={16} aria-hidden="true" />
            {loggingOut ? 'Saindo…' : 'Sair'}
          </button>
          {logoutError && <p className={styles.logoutError} role="alert">{logoutError}</p>}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
