import React from 'react';

/* ======================================================================
   Layout primitives for settings pages.

   SettingsPage — outer wrapper that provides the editorial layout
                  (folio + scrollable body, sticky footer support)
   Folio        — slim mono caps row at the very top of every page
   SaveFooter   — sticky save footer that appears when state is dirty
   ====================================================================== */

/* ─────────────────────────────────────────────────────────────────────
   SettingsPage — wraps an entire settings page with folio + scroll body.

   Composition:
     <SettingsPage folio={...}>
       <PageHeader ... />
       <div className="set-body">
         <Section ... />
         <Section ... />
       </div>
       <SaveFooter dirty={...} />  (optional, renders sticky bottom)
     </SettingsPage>
   ───────────────────────────────────────────────────────────────────── */

interface SettingsPageProps {
  folio: { left: React.ReactNode; right: React.ReactNode };
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function SettingsPage({ folio, children, footer }: SettingsPageProps) {
  return (
    <div className="set-page">
      <Folio left={folio.left} right={folio.right} />
      <div className="set-page-scroll">{children}</div>
      {footer}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Folio — slim mono caps row at the top of every settings main panel.

   Left side typically: agent dot + agent name + section path
   Right side typically: model + time, or app meta + time

   Example:
     <Folio
       left={<>
         <span><span className="agent-dot" /> luca</span>
         <span>settings · <span className="v">general</span></span>
       </>}
       right={<>
         <span>opus 4.7</span>
         <span>{useClock()}</span>
       </>}
     />
   ───────────────────────────────────────────────────────────────────── */

export function Folio({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="folio">
      <div className="folio-left">{left}</div>
      <div className="folio-right">{right}</div>
    </div>
  );
}

/* AgentDot — small colored dot used in Folio left side. */
export function AgentDot({
  color = 'var(--luca-color, #c9a87c)',
}: {
  color?: string;
}) {
  return (
    <span
      className="agent-dot"
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────
   SaveFooter — sticky save footer at the bottom of mutating settings
                pages. Appears when state is dirty.
   ───────────────────────────────────────────────────────────────────── */

interface SaveFooterProps {
  dirty: boolean;
  saving?: boolean;
  message?: string;
  onDiscard: () => void;
  onSave: () => void;
}

export function SaveFooter({
  dirty,
  saving,
  message,
  onDiscard,
  onSave,
}: SaveFooterProps) {
  if (!dirty) return null;

  return (
    <div className="save-footer">
      <span className="save-footer-msg">
        {message ?? (saving ? 'Saving…' : 'Unsaved changes')}
      </span>
      <div className="save-footer-actions">
        <button type="button" className="set-btn" onClick={onDiscard} disabled={saving}>
          Discard
        </button>
        <button
          type="button"
          className="set-btn primary"
          onClick={onSave}
          disabled={saving}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}
