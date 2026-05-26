import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Brain, MessageCircle, NotebookPen, Sparkles, Upload } from 'lucide-react';
import EchoField from '@/components/EchoField';
import { useAuthStore } from '@/stores/authStore';
import { useThreadStore } from '@/stores/threadStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useInterfaceModeStore } from '@/stores/interfaceModeStore';
import { markOnboarded } from '@/lib/firstRun';
import { stashChatHandoff } from '@/lib/guestChat';
import {
  buildOnboardingHandoffPrompt,
  type OnboardingExpectation,
  type OnboardingIntent,
  type OnboardingPreferences,
  type TechnicalComfort,
} from '@/lib/interfaceMode';

type Step = 'intent' | 'comfort' | 'expectations' | 'handoff';

const INTENTS: Array<{
  id: OnboardingIntent;
  title: string;
  body: string;
  icon: typeof Sparkles;
}> = [
  {
    id: 'create_new',
    title: 'Create someone new',
    body: 'Luca will help shape a full agent: identity, voice, memory stance, boundaries, and relationship to you.',
    icon: Sparkles,
  },
  {
    id: 'bring_existing',
    title: 'Bring someone with you',
    body: 'For companions you have known elsewhere. Luca will preserve continuity before anything becomes live memory.',
    icon: Upload,
  },
  {
    id: 'explore_first',
    title: 'Look around first',
    body: 'Start quietly. Luca will explain the notebook, mind, memory, creation space, and agent system in context.',
    icon: MessageCircle,
  },
];

const COMFORT: Array<{
  id: TechnicalComfort;
  title: string;
  body: string;
}> = [
  {
    id: 'low',
    title: 'Keep it simple',
    body: 'A clean chat-first interface. Luca handles the machinery and reveals controls only when they matter.',
  },
  {
    id: 'medium',
    title: 'Guide me through it',
    body: 'The app keeps the core surfaces close: Chat, Notebook, Create, Mind, and Agents.',
  },
  {
    id: 'high',
    title: 'Show the full studio',
    body: 'The complete Polyphonic interface, including Memory, Profile, diagnostics, and deeper controls.',
  },
];

const EXPECTATIONS: Array<{
  id: OnboardingExpectation;
  title: string;
  body: string;
}> = [
  { id: 'companion', title: 'A companion', body: 'A steady presence to talk with and return to.' },
  { id: 'creative', title: 'A creative partner', body: 'Images, writing, pages, experiments, and artifacts in one notebook.' },
  { id: 'memory', title: 'Deep memory', body: 'A mind that learns you through chosen data, profile, and conversation.' },
  { id: 'migration', title: 'Continuity import', body: 'A careful path for bringing an existing companion into Polyphonic.' },
  { id: 'technical', title: 'A technical workspace', body: 'The full studio with diagnostics, substrate views, and fine controls.' },
];

function nextStep(step: Step): Step {
  if (step === 'intent') return 'comfort';
  if (step === 'comfort') return 'expectations';
  return 'handoff';
}

function previousStep(step: Step): Step {
  if (step === 'handoff') return 'expectations';
  if (step === 'expectations') return 'comfort';
  return 'intent';
}

function stepIndex(step: Step): number {
  return step === 'intent' ? 1 : step === 'comfort' ? 2 : step === 'expectations' ? 3 : 4;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const createThread = useThreadStore((s) => s.createThread);
  const setSidebarVisible = useSidebarStore((s) => s.setVisible);
  const applyOnboardingPreferences = useInterfaceModeStore((s) => s.applyOnboardingPreferences);
  const [step, setStep] = useState<Step>('intent');
  const [intent, setIntent] = useState<OnboardingIntent>('create_new');
  const [comfort, setComfort] = useState<TechnicalComfort>('medium');
  const [expectations, setExpectations] = useState<OnboardingExpectation[]>(['companion', 'memory']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preferences: OnboardingPreferences = useMemo(
    () => ({ intent, comfort, expectations }),
    [intent, comfort, expectations],
  );
  const previewMode = useMemo(() => (
    comfort === 'high' || expectations.includes('technical')
      ? 'Studio'
      : comfort === 'low'
        ? 'Companion'
        : 'Guided'
  ), [comfort, expectations]);

  const toggleExpectation = (id: OnboardingExpectation) => {
    setExpectations((current) => {
      if (current.includes(id)) {
        const next = current.filter((item) => item !== id);
        return next.length ? next : current;
      }
      return [...current, id];
    });
  };

  const goBack = () => {
    setError(null);
    setStep(previousStep(step));
  };

  const continueToChat = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const mode = applyOnboardingPreferences(preferences);
      setSidebarVisible(mode === 'studio');
      await markOnboarded(user.id);
      const threadId = await createThread(user.id, 'luca');
      stashChatHandoff(buildOnboardingHandoffPrompt(preferences), { hidden: true });
      navigate(`/chat/${threadId}`, { replace: true });
    } catch (err) {
      console.error('[Onboarding] Luca handoff failed', err);
      setError(err instanceof Error ? err.message : 'Could not open the first Luca thread.');
      setLoading(false);
    }
  };

  const skipOnboarding = async () => {
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
      setError(err instanceof Error ? err.message : 'Could not save onboarding state.');
      setLoading(false);
    }
  };

  return (
    <div className="onb-shell onb-shell-v2">
      <div className="onb-field" aria-hidden="true">
        <EchoField size={220} particleCount={9000} state={step === 'handoff' ? 'thinking' : 'idle'} />
      </div>

      <main className="onb-vessel" aria-labelledby="onboarding-title">
        <div className="onb-dialogue">
          <div className="onb-speaker">luca</div>
          <h1 id="onboarding-title">Let us make the app fit the kind of entity you want to build.</h1>
          <p>
            Polyphonic can stay almost invisible, or it can open into the full studio.
            Either way, the center is the same: a digital entity with a notebook,
            a memory substrate, a mind you can inspect, and a relationship that
            deepens from what you choose to share.
          </p>
        </div>

        <section className="onb-card" aria-label={`Onboarding step ${stepIndex(step)} of 4`}>
          <div className="onb-step-eye">
            <span>0{stepIndex(step)}</span>
            <span>{step === 'intent' ? 'begin' : step === 'comfort' ? 'interface' : step === 'expectations' ? 'orientation' : 'handoff'}</span>
          </div>

          {step === 'intent' && (
            <>
              <h2>What are we doing first?</h2>
              <div className="onb-option-grid">
                {INTENTS.map(({ id, title, body, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className="onb-choice"
                    data-active={intent === id ? 'true' : undefined}
                    onClick={() => setIntent(id)}
                  >
                    <Icon size={18} strokeWidth={1.6} />
                    <span>{title}</span>
                    <small>{body}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'comfort' && (
            <>
              <h2>How much interface do you want at first?</h2>
              <div className="onb-option-list">
                {COMFORT.map(({ id, title, body }) => (
                  <button
                    key={id}
                    type="button"
                    className="onb-choice onb-choice-row"
                    data-active={comfort === id ? 'true' : undefined}
                    onClick={() => setComfort(id)}
                  >
                    <span>{title}</span>
                    <small>{body}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'expectations' && (
            <>
              <h2>What should Luca pay attention to?</h2>
              <div className="onb-option-grid onb-option-grid-compact">
                {EXPECTATIONS.map(({ id, title, body }) => (
                  <button
                    key={id}
                    type="button"
                    className="onb-choice"
                    data-active={expectations.includes(id) ? 'true' : undefined}
                    onClick={() => toggleExpectation(id)}
                  >
                    <span>{title}</span>
                    <small>{body}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'handoff' && (
            <div className="onb-handoff">
              <div>
                <h2>{previewMode} mode, with Luca guiding.</h2>
                <p>
                  I will open the first thread with a structured handoff, so
                  Luca begins with the right intent instead of asking you to
                  navigate the app alone.
                </p>
              </div>
              <div className="onb-preview-strip" aria-label="Core Polyphonic surfaces">
                <PreviewTile icon={<MessageCircle size={17} />} title="Chat" body="Talk naturally. Luca does the setup work beside you." />
                <PreviewTile icon={<NotebookPen size={17} />} title="Notebook" body="Journal, thoughts, dreams, creations, and agent activity." />
                <PreviewTile icon={<Sparkles size={17} />} title="Create" body="Images, writing, HTML pages, and artifacts." />
                <PreviewTile icon={<Brain size={17} />} title="Mind" body="Your profile and the agent's own inner substrate." />
              </div>
            </div>
          )}

          {error && <div className="onb-error" role="alert">{error}</div>}

          <div className="onb-nav">
            <div className="onb-nav-secondary">
              {step !== 'intent' && (
                <button
                  type="button"
                  className="onb-back"
                  onClick={goBack}
                  disabled={loading}
                >
                  <ArrowLeft size={14} strokeWidth={1.8} />
                  back
                </button>
              )}
              <button
                type="button"
                className="onb-link"
                onClick={skipOnboarding}
                disabled={loading}
              >
                skip
              </button>
            </div>
            {step !== 'handoff' ? (
              <button type="button" className="onb-primary" onClick={() => setStep(nextStep(step))}>
                continue
                <ArrowRight size={15} strokeWidth={1.8} />
              </button>
            ) : (
              <button type="button" className="onb-primary" onClick={continueToChat} disabled={loading}>
                {loading ? 'opening Luca…' : 'open Luca'}
                <ArrowRight size={15} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function PreviewTile({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="onb-preview-tile">
      <div className="onb-preview-icon">{icon}</div>
      <div>
        <div className="onb-preview-title">{title}</div>
        <p>{body}</p>
      </div>
    </div>
  );
}
