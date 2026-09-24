import {
  Search, History, Compass, CreditCard, BookOpen, X, MapPinned, LogOut,
} from 'lucide-react';
import Badge from '../common/Badge.jsx';
import { API_BASE_URL } from '../../services/locationApi.js';
import styles from './Sidebar.module.css';

// Items with a `view` are real, working pages — clicking them switches
// App.jsx's active view. Items without one are not built yet and stay
// disabled with a "soon" badge instead of pretending to work.
const NAV_ITEMS = [
  {
    id: 'analysis', label: 'Nova Análise', icon: Search, view: 'analysis',
  },
  {
    id: 'history', label: 'Histórico', icon: History, view: null,
  },
  {
    id: 'explore', label: 'Explorar', icon: Compass, view: null,
  },
  {
    id: 'plans', label: 'Planos', icon: CreditCard, view: 'plans',
  },
];

// Documentação links to the real Swagger UI the backend already serves —
// a genuine feature, not a placeholder for a page that doesn't exist yet.
const DOCS_URL = `${API_BASE_URL}/api-docs`;

function Sidebar({
  isOpen, onClose, activeView, onNavigate, onLogout,
}) {
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
            id, label, icon: Icon, view,
          }) => {
            const isActive = view !== null && view === activeView;
            return (
              <button
                key={id}
                type="button"
                className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                disabled={view === null}
                aria-current={isActive ? 'page' : undefined}
                title={view === null ? 'Em breve' : undefined}
                onClick={view ? () => onNavigate(view) : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
                {view === null && <Badge tone="muted">Em breve</Badge>}
              </button>
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
            <button type="button" className={styles.planCta} onClick={() => onNavigate('plans')}>
              Ver planos
            </button>
          </div>
          <button type="button" className={styles.logoutButton} onClick={onLogout}>
            <LogOut size={16} aria-hidden="true" />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
