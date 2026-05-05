import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

function Probe() {
  const prefersReducedMotion = usePrefersReducedMotion();
  return <div data-testid="motion">{prefersReducedMotion ? 'reduce' : 'no-preference'}</div>;
}

describe('usePrefersReducedMotion', () => {
  let matches = false;
  let listeners: Set<() => void>;

  beforeEach(() => {
    matches = false;
    listeners = new Set();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return matches;
        },
        media: query,
        addEventListener: (_event: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_event: string, cb: () => void) => listeners.delete(cb),
      })),
    });
  });

  it('tracks the live reduced-motion media query', () => {
    render(<Probe />);
    expect(screen.getByTestId('motion')).toHaveTextContent('no-preference');

    act(() => {
      matches = true;
      listeners.forEach((listener) => listener());
    });

    expect(screen.getByTestId('motion')).toHaveTextContent('reduce');
  });
});
