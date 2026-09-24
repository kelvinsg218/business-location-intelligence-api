import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoginPage from './LoginPage.jsx';

describe('LoginPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows an error and does not call onLogin for wrong credentials', () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'root' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByText('Usuário ou senha inválidos.')).toBeInTheDocument();
  });

  it('calls onLogin for the correct root/1 credentials', () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);

    fireEvent.change(screen.getByLabelText('Usuário'), { target: { value: 'root' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Usuário ou senha inválidos.')).not.toBeInTheDocument();
  });
});
