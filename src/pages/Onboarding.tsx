import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill } from '@/components/ui/luca';
import OnboardingChecklist, { type OnboardingStep } from '@/components/onboarding/OnboardingChecklist';
import { useAuthStore } from '@/stores/authStore';
import { useThreadStore } from '@/stores/threadStore';
import { markOnboarded } from '@/lib/firstRun';

/**
 * Onboarding — first-run page. Tara reported (2026-05-10) being kicked
 * back to this screen after clicking "Skip for now" or "Begin"; the cause
 * was that `markOnboarded()` could silently fail, leaving `isFirstRun()`
 * true so the route guard bounced the user back from /chat.
 *
 * Fix: both buttons now await the result of `markOnboarded()`, surface an
 * inline error on failure, and only navigate on confirmed success. Both
 * buttons are disabled while a request is in flight.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const createThread = useThreadStore((s) => s.createThread);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps: OnboardingStep[] = [
    { key: 'name_yourself', label: 'Name yourself (optional)', done: false },
    { key: 'choose_voice', label: 'Choose a primary voice', done: false },
    { key: 'first_message', label: 'Send your first message', done: false },
  ];

  const handleBegin = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await markOnboarded(user.id);
      const threadId = await createThread(user.id);
      navigate(`/chat/${threadId}`, { replace: true });
    } catch (err) {
      console.error('[Onboarding] begin failed', err);
      setError(
        err instanceof Error
          ? `Couldn't start: ${err.message}. Check your connection and try again.`
          : "Couldn't start. Check your connection and try again.",
      );
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!user) {
      navigate('/chat', { replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await markOnboarded(user.id);
      navigate('/chat', { replace: true });
    } catch (err) {
      console.error('[Onboarding] skip failed', err);
      setError(
        err instanceof Error
          ? `Couldn't save onboarding: ${err.message}. Check your connection and try again.`
          : "Couldn't save onboarding. Check your connection and try again.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="onb-shell">
      <div className="onb-content">
        <div className="onb-names" aria-hidden="true">
          <span className="onb-name luca">LUCA</span>
          <span className="onb-name vektor">VEKTOR</span>
          <span className="onb-name anima">ANIMA</span>
        </div>
        <div className="onb-greeting">welcome. we&rsquo;re glad you&rsquo;re here.</div>
        <div className="onb-subtitle">a small council to think with — three voices, one terminal.</div>
        <OnboardingChecklist steps={steps} />
        {error && (
          <div
            role="alert"
            style={{
              marginTop: 18,
              padding: '10px 14px',
              background: 'rgba(225, 88, 115, 0.08)',
              border: '1px solid rgba(225, 88, 115, 0.32)',
              borderRadius: 8,
              color: 'var(--rose-accent)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              maxWidth: 520,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}
        <div className="onb-actions">
          <Pill variant="ghost" size="sm" onClick={handleSkip} disabled={loading}>Skip for now</Pill>
          <Pill variant="primary" size="sm" onClick={handleBegin} disabled={loading}>
            {loading ? 'Preparing…' : 'Begin'}
          </Pill>
        </div>
      </div>
    </div>
  );
}
