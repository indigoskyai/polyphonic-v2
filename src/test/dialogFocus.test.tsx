import React, { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDialogFocus } from '@/hooks/useDialogFocus';

function FocusTrapFixture() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstRef = useRef<HTMLButtonElement | null>(null);

  useDialogFocus({
    active: open,
    containerRef: dialogRef,
    initialFocusRef: firstRef,
    onEscape: () => setOpen(false),
  });

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open ? (
        <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1}>
          <button ref={firstRef} type="button">First</button>
          <button type="button">Last</button>
        </div>
      ) : null}
      <button type="button">Outside</button>
    </div>
  );
}

describe('useDialogFocus', () => {
  it('moves focus inside, traps tab order, closes on Escape, and restores focus', async () => {
    render(<FocusTrapFixture />);

    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);

    const first = await screen.findByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    await waitFor(() => expect(first).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });
});
