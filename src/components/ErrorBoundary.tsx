import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '@/lib/observability';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional override for the fallback UI. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level error boundary. Catches render errors in the React tree, reports
 * them through `reportError`, and renders a minimal fallback that lets the
 * user reload without losing the rest of the chrome.
 *
 * This is intentionally tiny — it covers the launch-gate requirement that one
 * component crash does not tank the whole app. Per-route boundaries can be
 * layered on later if a specific surface needs custom recovery UX. The
 * profile-tab boundary in ProfileView.tsx is one example.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, 'react', { extras: { componentStack: info.componentStack } });
  }

  handleReload = (): void => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--floor)',
          color: 'var(--text-body)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              letterSpacing: 'var(--track-meta)',
              textTransform: 'uppercase',
              color: 'var(--text-ghost)',
              marginBottom: 14,
            }}
          >
            § Unexpected error
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: 'var(--track-tight)',
              marginBottom: 12,
              color: 'var(--text-primary)',
            }}
          >
            Something fell out of joint.
          </h1>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              marginBottom: 22,
            }}
          >
            The error has been logged. A reload usually puts things back.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '9px 18px',
              background: 'transparent',
              border: '1px solid var(--border-faint)',
              borderRadius: 8,
              color: 'var(--text-body)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              letterSpacing: 'var(--track-ui)',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
