import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import HintAnalysis from './HintAnalysis';

describe('hint analysis', () => {
  it('shows the stored scores, supports navigation and asks for a note only on disagreement', () => {
    const review = text => ({ hint: text, scores: [100,90,100,100,90,95,90,65,90,95], notes: { 8: 'Check relevance.' } });
    const puzzle = { moveHints: [['First hint', 'Second hint']], hintReviews: { moves: [[review('First hint'), review('Second hint')]] } };
    render(<HintAnalysis puzzle={puzzle} moveIndex={0} hintIndex={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analyze hint' }));
    expect(screen.getByText('First hint')).toBeInTheDocument();
    expect(screen.getByText('Check relevance.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Why do you disagree with the overall grade?')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Disagree' })[0]);
    fireEvent.change(screen.getByLabelText('Why do you disagree with the overall grade?'), { target: { value: 'My note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Second hint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByLabelText('Why do you disagree with the overall grade?')).toHaveValue('My note');
    fireEvent.click(screen.getAllByRole('button', { name: 'Agree' })[0]);
    expect(screen.queryByLabelText('Why do you disagree with the overall grade?')).not.toBeInTheDocument();
  });
});
