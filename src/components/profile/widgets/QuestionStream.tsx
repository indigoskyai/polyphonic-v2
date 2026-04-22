import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate } from 'react-router-dom';
import WidgetTile from './WidgetTile';

/** Curiosity questions Luca has not yet asked — clickable to start a thread. */
export default function QuestionStream({ dragHandleProps }: { dragHandleProps?: Record<string, any> }) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<{ id: string; question: string; curiosity_score: number | null }[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('curiosity_questions')
        .select('id, question, curiosity_score, status')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('curiosity_score', { ascending: false })
        .limit(6);
      if (cancelled || !data) return;
      setQuestions(data);
    })();
    return () => { cancelled = true; };
  }, [user]);

  function ask(q: string) {
    // Open chat with question as opener.
    sessionStorage.setItem('luca:opener', q);
    navigate('/');
  }

  return (
    <WidgetTile
      title="Unasked questions"
      subtitle={`${questions.length} pending`}
      empty={questions.length === 0}
      dragHandleProps={dragHandleProps}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%', overflow: 'hidden' }}>
        {questions.map((q) => (
          <button
            key={q.id}
            onClick={() => ask(q.question)}
            style={{
              textAlign: 'left',
              padding: '4px 6px',
              background: 'transparent',
              border: '1px solid transparent',
              borderRadius: 4,
              color: 'var(--text-soft)',
              fontSize: 10,
              lineHeight: 1.4,
              cursor: 'pointer',
              fontStyle: 'italic',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-surface)';
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.border = '1px solid var(--border-subtle)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-soft)';
              e.currentTarget.style.border = '1px solid transparent';
            }}
          >
            {q.question}
          </button>
        ))}
      </div>
    </WidgetTile>
  );
}
