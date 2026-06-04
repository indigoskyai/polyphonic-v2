import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bot, Brain, CheckCircle2, KeyRound, MessageCircle, NotebookPen, Sparkles, Upload } from 'lucide-react';
import EchoField from '@/components/EchoField';
import ConnectOpenRouter from '@/components/ConnectOpenRouter';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useThreadStore } from '@/stores/threadStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useInterfaceModeStore } from '@/stores/interfaceModeStore';
import { useLucaGuideStore } from '@/stores/lucaGuideStore';
import { markOnboarded } from '@/lib/firstRun';
import { stashChatHandoff } from '@/lib/guestChat';
import {
  buildOnboardingHandoffPrompt,
  type OnboardingExpectation,
  type OnboardingIntent,
  type OnboardingPreferences,
  type TechnicalComfort,
} from '@/lib/interfaceMode';

type Step = 'intent' | 'comfort' | 'expectations' | 'connect' | 'handoff';

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
    body: 'Start quietly. The Polyphonic Guide will explain the notebook, memory, and agents without opening a Luca thread yet.',
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
    body: 'The app keeps the four core surfaces close: Chat, Notebook, Memory, and Agents.',
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
  if (step === 'expectations') return 'handoff';
  if (step === 'connect') return 'handoff';
  return 'handoff';
}

function previousStep(step: Step, requiresOpenRouter: boolean): Step {
  if (step === 'handoff') return requiresOpenRouter ? 'connect' : 'expectations';
  if (step === 'connect') return 'expectations';
  if (step === 'expectations') return 'comfort';
  return 'intent';
}

function stepIndex(step: Step): number {
  return step === 'intent' ? 1 : step === 'comfort' ? 2 : step === 'expectations' ? 3 : step === 'connect' ? 4 : 5;
}

function needsOpenRouter(intent: OnboardingIntent): boolean {
  return intent === 'create_new' || intent === 'bring_existing';
}

export default function Onboarding() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const createThread = useThreadStore((s) => s.createThread);
  const setSidebarVisible = useSidebarStore((s) => s.setVisible);
  const applyOnboardingPreferences = useInterfaceModeStore((s) => s.applyOnboardingPreferences);
  const setGuideOpen = useLucaGuideStore((s) => s.setOpen);
  const [step, setStep] = useState<Step>('intent');
  const [intent, setIntent] = useState<OnboardingIntent>('create_new');
  const [comfort, setComfort] = useState<TechnicalComfort>('medium');
  const [expectations, setExpectations] = useState<OnboardingExpectation[]>(['companion', 'memory']);
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [checkingKey, setCheckingKey] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresOpenRouter = needsOpenRouter(intent);
  const openRouterConnected = !!keyPreview;
  const requiresConnectStep = requiresOpenRouter && !openRouterConnected;
  const totalSteps = requiresConnectStep ? 5 : 4;
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

  useEffect(() => {
    if (!user) {
      setCheckingKey(false);
      setKeyPreview(null);
      return;
    }
    let canceled = false;
    setCheckingKey(true);
    supabase
      .from('user_api_keys')
      .select('key_preview')
      .maybeSingle()
      .then(({ data, error }) => {
        if (canceled) return;
        setKeyPreview(error ? null : data?.key_preview ?? null);
      })
      .finally(() => {
        if (!canceled) setCheckingKey(false);
      });
    return () => { canceled = true; };
  }, [user?.id]);

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
    setStep(previousStep(step, requiresConnectStep));
  };

  const goForward = () => {
    setError(null);
    if (step === 'expectations') {
      setStep(requiresConnectStep ? 'connect' : 'handoff');
      return;
    }
    setStep(nextStep(step));
  };

  const continueToChat = async () => {
    if (!user) return;
    if (requiresOpenRouter && !openRouterConnected) {
      setError('Connect OpenRouter before Luca starts an agent or companion-import conversation.');
      setStep('connect');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const mode = applyOnboardingPreferences(preferences);
      setSidebarVisible(mode === 'studio');
      await markOnboarded(user.id, undefined, { interfaceMode: mode, preferences });
      const threadId = await createThread(user.id, 'luca');
      stashChatHandoff(buildOnboardingHandoffPrompt(preferences), { hidden: true });
      navigate(`/chat/${threadId}`, { replace: true });
    } catch (err) {
      console.error('[Onboarding] Luca handoff failed', err);
      setError(err instanceof Error ? err.message : 'Could not open the first Luca thread.');
      setLoading(false);
    }
  };

  const continueToGuide = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const mode = applyOnboardingPreferences(preferences);
      setSidebarVisible(mode === 'studio');
      await markOnboarded(user.id, undefined, { interfaceMode: mode, preferences });
      setGuideOpen(true);
      navigate('/chat?guide=1', { replace: true });
    } catch (err) {
      console.error('[Onboarding] guide handoff failed', err);
      setError(err instanceof Error ? err.message : 'Could not open the Polyphonic Guide.');
      setLoading(false);
    }
  };

  const skipOnboarding = async () => {
    if (!user) {
      navigate('/chat?guide=1', { replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await markOnboarded(user.id, undefined, {
        interfaceMode: 'guided',
        preferences: { intent: 'explore_first', comfort: 'medium', expectations: ['companion'] },
      });
      setGuideOpen(true);
      navigate('/chat?guide=1', { replace: true });
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
          <div className="onb-speaker">{requiresOpenRouter ? 'luca' : 'polyphonic guide'}</div>
          <h1 id="onboarding-title">Let us make the app fit the kind of entity you want to build.</h1>
          <p>
            Polyphonic can stay almost invisible, or it can open into the full studio.
            Either way, the center is the same: a digital entity with a notebook,
            a memory substrate, a mind you can inspect, and a relationship that
            deepens from what you choose to share.
          </p>
        </div>

        <section className="onb-card" aria-label={`Onboarding step ${Math.min(stepIndex(step), totalSteps)} of ${totalSteps}`}>
          <div className="onb-step-eye">
            <span>0{Math.min(stepIndex(step), totalSteps)}</span>
            <span>{step === 'intent' ? 'begin' : step === 'comfort' ? 'interface' : step === 'expectations' ? 'orientation' : step === 'connect' ? 'model account' : 'handoff'}</span>
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
                <h2>{previewMode} mode, with {requiresOpenRouter ? 'Luca' : 'the Polyphonic Guide'}.</h2>
                <p>
                  {requiresOpenRouter
                    ? 'I will open the first thread with a structured handoff, so Luca begins with the right intent instead of asking you to navigate the app alone.'
                    : 'You can look around without connecting a model account. The Guide can answer questions about the app, point to surfaces, and help you decide when you are ready to connect OpenRouter for Luca.'}
                </p>
              </div>
              <div className="onb-preview-strip" aria-label="Core Polyphonic surfaces">
                <PreviewTile icon={<MessageCircle size={17} />} title="Chat" body={requiresOpenRouter ? 'Talk naturally. Luca does the setup work beside you.' : 'Ask the Guide how Polyphonic works before starting a real agent thread.'} />
                <PreviewTile icon={<NotebookPen size={17} />} title="Notebook" body="Journal, thoughts, dreams, and creative work in one feed." />
                <PreviewTile icon={<Brain size={17} />} title="Memory" body="The living substrate — watch the relationship deepen." />
                <PreviewTile icon={<Bot size={17} />} title="Agents" body="Shape Luca's voice or bring an entity of your own." />
              </div>
            </div>
          )}

          {step === 'connect' && (
            <div className="onb-connect">
              <div className="onb-connect-head">
                <KeyRound size={18} strokeWidth={1.7} />
                <div>
                  <h2>Connect OpenRouter before Luca begins.</h2>
                  <p>
                    Your agent conversations run through your own OpenRouter account.
                    This keeps model access under your control and lets Luca use the full Polyphonic substrate.
                  </p>
                </div>
              </div>

              {checkingKey ? (
                <div className="onb-key-status">checking model account…</div>
              ) : openRouterConnected ? (
                <div className="onb-key-status connected">
                  <CheckCircle2 size={16} strokeWidth={1.8} />
                  <span>OpenRouter connected · {keyPreview}</span>
                </div>
              ) : (
                <ConnectOpenRouter
                  label="Connect OpenRouter"
                  onConnected={(preview) => {
                    setKeyPreview(preview || 'connected');
                    setError(null);
                  }}
                />
              )}

              <p className="onb-connect-note">
                The popup lets you sign in or create an OpenRouter account without leaving Polyphonic.
                If you only want to explore first, go back and choose “Look around first.”
              </p>
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
              <button
                type="button"
                className="onb-primary"
                onClick={goForward}
                disabled={loading || (step === 'connect' && !openRouterConnected)}
              >
                continue
                <ArrowRight size={15} strokeWidth={1.8} />
              </button>
            ) : (
              <button type="button" className="onb-primary" onClick={requiresOpenRouter ? continueToChat : continueToGuide} disabled={loading}>
                {loading ? (requiresOpenRouter ? 'opening Luca…' : 'opening Guide…') : (requiresOpenRouter ? 'open Luca' : 'look around with Guide')}
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
