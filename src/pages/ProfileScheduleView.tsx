import { useEffect, useState } from 'react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type ScheduledTask = {
  id: string;
  name: string;
  schedule_expr: string;
  prompt: string;
  delivery_mode: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_run_status: string | null;
};

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function nextDailyIso(time: string, day?: string) {
  const [hour, minute] = time.split(':').map(Number);
  const next = new Date();
  next.setSeconds(0, 0);
  next.setHours(hour || 9, minute || 0, 0, 0);
  if (day) {
    const wanted = DAYS.indexOf(day);
    let delta = (wanted - next.getDay() + 7) % 7;
    if (delta === 0 && next <= new Date()) delta = 7;
    next.setDate(next.getDate() + delta);
  } else if (next <= new Date()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

function formatTime(value: string | null) {
  if (!value) return 'Not run yet';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function ProfileScheduleView() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [cadence, setCadence] = useState<'daily' | 'weekly' | 'cron'>('daily');
  const [time, setTime] = useState('09:00');
  const [day, setDay] = useState('MON');
  const [cron, setCron] = useState('0 9 * * MON');

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('scheduled_tasks')
      .select('id, name, schedule_expr, prompt, delivery_mode, enabled, last_run_at, next_run_at, last_run_status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      if (!error.message.toLowerCase().includes('scheduled_tasks')) {
        toast({ title: 'Could not load schedule', description: error.message, variant: 'destructive' });
      }
      setTasks([]);
    } else {
      setTasks((data || []) as ScheduledTask[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [user?.id]);

  async function createTask() {
    if (!user || !name.trim() || !prompt.trim()) return;
    if (tasks.length >= 20) {
      toast({ title: 'Schedule full', description: 'Luca can keep 20 scheduled tasks for now.', variant: 'destructive' });
      return;
    }

    const [hour, minute] = time.split(':').map(Number);
    const scheduleExpr = cadence === 'daily'
      ? `${minute || 0} ${hour || 9} * * *`
      : cadence === 'weekly'
        ? `${minute || 0} ${hour || 9} * * ${day}`
        : cron;

    const nextRun = cadence === 'cron' ? nextDailyIso(time, day) : nextDailyIso(time, cadence === 'weekly' ? day : undefined);
    const { error } = await supabase.from('scheduled_tasks').insert({
      user_id: user.id,
      agent_id: 'luca',
      name: name.trim(),
      prompt: prompt.trim(),
      schedule_expr: scheduleExpr,
      next_run_at: nextRun,
      delivery_mode: 'in_app',
    });
    if (error) {
      toast({ title: 'Could not create task', description: error.message, variant: 'destructive' });
      return;
    }
    setName('');
    setPrompt('');
    load();
  }

  async function updateTask(id: string, patch: Partial<ScheduledTask>) {
    const { error } = await supabase.from('scheduled_tasks').update(patch).eq('id', id);
    if (error) toast({ title: 'Could not update task', description: error.message, variant: 'destructive' });
    else load();
  }

  async function deleteTask(id: string, taskName: string) {
    if (!window.confirm(`Delete ${taskName}?`)) return;
    const { error } = await supabase.from('scheduled_tasks').delete().eq('id', id);
    if (error) toast({ title: 'Could not delete task', description: error.message, variant: 'destructive' });
    else load();
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="profile-page-frame" style={{ padding: '44px 48px 80px', maxWidth: 980 }}>
        <div style={{ marginBottom: 34 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--track-mono)', color: 'var(--text-ghost)', textTransform: 'uppercase', marginBottom: 12 }}>
            § L8 / schedule
          </div>
          <h1 style={{ fontFamily: 'var(--font-sans)', fontSize: 42, lineHeight: 1, color: 'var(--text-primary)', margin: 0 }}>
            Luca's schedule
          </h1>
        </div>

        <section style={{ borderTop: '1px solid var(--border-faint)', padding: '24px 0 28px' }}>
          <div className="profile-schedule-form-grid grid gap-3" style={{ gridTemplateColumns: 'minmax(180px, 1fr) 140px 120px 120px' }}>
            <input aria-label="Task name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={fieldStyle} />
            <select aria-label="Task cadence" value={cadence} onChange={(e) => setCadence(e.target.value as any)} style={fieldStyle}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="cron">Cron</option>
            </select>
            <input aria-label="Task time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={fieldStyle} />
            {cadence === 'weekly' ? (
              <select aria-label="Task day" value={day} onChange={(e) => setDay(e.target.value)} style={fieldStyle}>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            ) : cadence === 'cron' ? (
              <input aria-label="Cron expression" value={cron} onChange={(e) => setCron(e.target.value)} style={fieldStyle} />
            ) : <span />}
          </div>
          <textarea aria-label="Task prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Prompt" style={{ ...fieldStyle, width: '100%', minHeight: 92, marginTop: 12, paddingTop: 10 }} />
          <button type="button" onClick={createTask} style={primaryButtonStyle}>Create task</button>
        </section>

        <section style={{ borderTop: '1px solid var(--border-faint)' }}>
          {loading ? (
            <p style={{ color: 'var(--text-ghost)', fontSize: 14 }}>Loading schedule...</p>
          ) : tasks.length === 0 ? (
            <p style={{ color: 'var(--text-ghost)', fontSize: 14, lineHeight: 1.7, paddingTop: 24 }}>
              Nothing scheduled yet. Luca is quiet until you ask for a rhythm.
            </p>
          ) : tasks.map((task) => (
            <div key={task.id} className="profile-schedule-task-row flex items-start gap-4" style={{ padding: '20px 0', borderBottom: '1px solid var(--border-faint)' }}>
              <div className="min-w-0 flex-1">
                <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>{task.name}</h2>
                <p style={{ margin: '8px 0 0', color: 'var(--text-body)', fontSize: 14, lineHeight: 1.6 }}>{task.prompt}</p>
                <div style={{ marginTop: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--track-mono)', textTransform: 'uppercase' }}>
                  {task.schedule_expr} · next {formatTime(task.next_run_at)} · last {formatTime(task.last_run_at)} · {task.last_run_status || 'waiting'}
                </div>
              </div>
              <button title={task.enabled ? 'Pause' : 'Resume'} aria-label={task.enabled ? 'Pause' : 'Resume'} onClick={() => updateTask(task.id, { enabled: !task.enabled })} style={iconButtonStyle}>
                {task.enabled ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <button title="Delete" aria-label="Delete" onClick={() => deleteTask(task.id, task.name)} style={{ ...iconButtonStyle, color: 'var(--danger)' }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  height: 38,
  borderRadius: 8,
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-raised)',
  color: 'var(--text-primary)',
  padding: '0 10px',
  fontSize: 13,
};

const primaryButtonStyle: React.CSSProperties = {
  marginTop: 12,
  border: '1px solid var(--border-faint)',
  borderRadius: 8,
  background: 'var(--surface-raised)',
  color: 'var(--text-primary)',
  padding: '10px 14px',
  fontSize: 13,
};

const iconButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: '1px solid var(--border-faint)',
  background: 'var(--surface-raised)',
  color: 'var(--text-tertiary)',
};
