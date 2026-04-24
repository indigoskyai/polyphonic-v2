import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill } from '@/components/ui/luca';
import OnboardingChecklist, { type OnboardingStep } from '@/components/onboarding/OnboardingChecklist';
import { useAuthStore } from '@/stores/authStore';
import { useThreadStore } from '@/stores/threadStore';
import { markOnboarded } from '@/lib/firstRun';

export default function Onboarding() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const createThread = useThreadStore((s) => s.createThread);
  const [loading, setLoading] = useState(false);

  const steps: OnboardingStep[] = [
    { key: 'name_yourself', label: 'Name yourself (optional)', done: false },
    { key: 'choose_voice', label: 'Choose a primary voice', done: false },
    { key: 'first_message', label: 'Send your first message', done: false },
  ];

  const handleBegin = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await markOnboarded(user.id);
      const threadId = await createThread(user.id);
      navigate(`/chat/${threadId}`, { replace: true });
    } catch (err) {
      console.error('[Onboarding] begin failed', err);
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!user) {
      navigate('/chat', { replace: true });
      return;
    }
    await markOnboarded(user.id);
    navigate('/chat', { replace: true });
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
