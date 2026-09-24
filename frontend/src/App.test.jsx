import {
  describe, it, expect, beforeEach,
} from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from './App.jsx';

function loginAsRoot() {
  fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'root' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
}

describe('App login gate', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows the login page before authenticating, not the app', () => {
    render(<App />);
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nova Análise' })).not.toBeInTheDocument();
  });

  it('shows an error and stays on the login page for wrong credentials', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'root' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(screen.getByText('Usuário ou senha inválidos.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nova Análise' })).not.toBeInTheDocument();
  });

  it('enters the app after logging in with root/1, and logging out returns to the login page', () => {
    render(<App />);
    loginAsRoot();

    expect(screen.getByRole('heading', { name: 'Nova Análise' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sair/i }));
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nova Análise' })).not.toBeInTheDocument();
  });
});

describe('App navigation (authenticated)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('starts on the analysis page and shows the empty state', () => {
    render(<App />);
    loginAsRoot();
    expect(screen.getByRole('heading', { name: 'Nova Análise' })).toBeInTheDocument();
    expect(screen.getByText('Nenhuma análise realizada ainda')).toBeInTheDocument();
  });

  it('navigates to the Plans page via the sidebar nav item and back via a plan CTA', () => {
    render(<App />);
    loginAsRoot();

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    fireEvent.click(within(nav).getByRole('button', { name: /Planos/i }));

    expect(screen.getByRole('heading', { name: 'Planos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pro' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Business' })).toBeInTheDocument();

    // Pro/Business must never look purchasable.
    const comingSoonButtons = screen.getAllByRole('button', { name: 'Em breve' });
    expect(comingSoonButtons.length).toBeGreaterThanOrEqual(2);
    comingSoonButtons.forEach((button) => expect(button).toBeDisabled());

    // Free's CTA is real and takes the user back to the working app.
    fireEvent.click(screen.getByRole('button', { name: 'Usar agora' }));
    expect(screen.getByRole('heading', { name: 'Nova Análise' })).toBeInTheDocument();
  });

  it('opens and closes the plan details modal without navigating away', () => {
    render(<App />);
    loginAsRoot();

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    fireEvent.click(within(nav).getByRole('button', { name: /Planos/i }));

    const [firstDetailsButton] = screen.getAllByRole('button', { name: 'Ver detalhes' });
    fireEvent.click(firstDetailsButton);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('O que está incluso')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('the feature matrix marks unbuilt features as planned, never as available', () => {
    render(<App />);
    loginAsRoot();

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    fireEvent.click(within(nav).getByRole('button', { name: /Planos/i }));

    expect(screen.getAllByLabelText('Planejado').length).toBeGreaterThan(0);
  });
});
