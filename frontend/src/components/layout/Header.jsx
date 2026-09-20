import { Menu, ExternalLink } from 'lucide-react';
import { API_BASE_URL } from '../../services/locationApi.js';
import styles from './Header.module.css';

const DOCS_URL = `${API_BASE_URL}/api-docs`;

function Header({ onMenuClick }) {
  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.menuButton}
        onClick={onMenuClick}
        aria-label="Abrir menu de navegação"
      >
        <Menu size={20} />
      </button>

      <div className={styles.spacer} />

      <nav className={styles.links} aria-label="Links secundários">
        <span className={styles.linkDisabled} title="Em breve">Sobre</span>
        <a href={DOCS_URL} target="_blank" rel="noreferrer" className={styles.link}>
          Documentação da API
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </nav>
    </header>
  );
}

export default Header;
