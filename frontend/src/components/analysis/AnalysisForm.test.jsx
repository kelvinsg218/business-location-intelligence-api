import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AnalysisForm from './AnalysisForm.jsx';

describe('AnalysisForm', () => {
  it('blocks submission and shows an inline error when location is empty', () => {
    const handleSubmit = vi.fn();
    render(<AnalysisForm onSubmit={handleSubmit} isLoading={false} serverErrors={[]} />);

    fireEvent.change(screen.getByLabelText('Tipo de negócio'), { target: { value: 'gym' } });
    fireEvent.click(screen.getByRole('button', { name: /analisar/i }));

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/informe uma localização válida/i)).toBeInTheDocument();
  });

  it('calls onSubmit with trimmed, typed values when the form is valid', () => {
    const handleSubmit = vi.fn();
    render(<AnalysisForm onSubmit={handleSubmit} isLoading={false} serverErrors={[]} />);

    fireEvent.change(screen.getByLabelText('Localização'), { target: { value: '  Vila Velha, ES  ' } });
    fireEvent.change(screen.getByLabelText('Tipo de negócio'), { target: { value: 'gym' } });
    fireEvent.change(screen.getByLabelText('Raio'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /analisar/i }));

    expect(handleSubmit).toHaveBeenCalledWith({
      location: 'Vila Velha, ES',
      businessType: 'gym',
      radiusKm: 5,
      keywords: '',
    });
  });

  it('disables the submit button while loading', () => {
    render(<AnalysisForm onSubmit={vi.fn()} isLoading serverErrors={[]} />);
    expect(screen.getByRole('button', { name: /analisando/i })).toBeDisabled();
  });
});
