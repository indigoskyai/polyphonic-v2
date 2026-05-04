import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useHandleStore, normalizeHandle, isValidHandle } from '@/stores/handleStore';
import { useProfileCanvasStore } from '@/stores/profileCanvasStore';
import { Check, X, ExternalLink } from 'lucide-react';

export default function PublicProfileSettings() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const myHandle = useHandleStore((s) => s.myHandle);
  const load = useHandleStore((s) => s.load);
  const checkAvailable = useHandleStore((s) => s.checkAvailable);
  const claimUserHandle = useHandleStore((s) => s.claimUserHandle);
  const loadByHandle = useProfileCanvasStore((s) => s.loadByHandle);
  const profile = useProfileCanvasStore((s) => s.profile);
  const updateProfile = useProfileCanvasStore((s) => s.updateProfile);

  const [handleInput, setHandleInput] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bioShort, setBioShort] = useState('');
  const [accent, setAccent] = useState('#c9a87c');
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (user) load(user.id); }, [user, load]);
  useEffect(() => { if (myHandle) loadByHandle(myHandle.handle); }, [myHandle, loadByHandle]);
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setBioShort(profile.bio_short);
      setAccent(profile.accent_color);
    }
  }, [profile]);

  // live availability check
  useEffect(() => {
    if (myHandle || !handleInput) { setAvailable(null); return; }
    const norm = normalizeHandle(handleInput);
    if (!isValidHandle(norm)) { setAvailable(false); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      const ok = await checkAvailable(norm);
      setAvailable(ok); setChecking(false);
    }, 350);
    return () => clearTimeout(t);
  }, [handleInput, myHandle, checkAvailable]);

  const claim = async () => {
    setError(null); setSaving(true);
    const res = await claimUserHandle(handleInput, displayName || normalizeHandle(handleInput));
    setSaving(false);
    if (!res.ok) setError((res as { ok: false; error: string }).error);
  };

  const saveProfile = async (patch: Partial<{ display_name: string; bio_short: string; accent_color: string; published: boolean }>) => {
    await updateProfile(patch);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div style={{ padding: '44px 48px 80px', maxWidth: 720 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--track-mono)', color: 'var(--text-ghost)', textTransform: 'uppercase', marginBottom: 12 }}>
          § settings / public profile
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 42, lineHeight: 1, color: 'var(--text-primary)', margin: 0, marginBottom: 8 }}>
          Public profile
        </h1>
        <p style={{ color: 'var(--text-soft)', fontSize: 14, marginBottom: 32, lineHeight: 1.55 }}>
          Claim a handle and you get a public canvas at <span style={{ fontFamily: 'var(--font-mono)' }}>polyphonic.app/@yourhandle</span>. Place artifacts, files, and notes anywhere on the canvas. Visitors pan and zoom to explore.
        </p>

        {!myHandle && (
          <Section label="Claim your handle">
            <Field label="Handle">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>@</span>
                <input
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  placeholder="riley_coyote"
                  style={inputStyle}
                />
                {handleInput && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 11, color: available === true ? '#8aa888' : available === false ? '#c97c8a' : 'var(--text-ghost)' }}>
                    {checking ? '…' : available === true ? <><Check size={12} /> available</> : available === false ? <><X size={12} /> taken</> : ''}
                  </span>
                )}
              </div>
              <Hint>3–24 chars, lowercase letters, numbers, underscores. Cannot be changed later.</Hint>
            </Field>
            <Field label="Display name">
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Riley Coyote" style={inputStyle} />
            </Field>
            {error && <div style={{ color: '#c97c8a', fontSize: 12, marginTop: 8 }}>{error}</div>}
            <button
              type="button"
              disabled={!available || saving}
              onClick={claim}
              style={{ ...primaryBtn, opacity: available && !saving ? 1 : 0.5, cursor: available && !saving ? 'pointer' : 'not-allowed', marginTop: 14 }}
            >
              {saving ? 'Claiming…' : 'Claim handle'}
            </button>
          </Section>
        )}

        {myHandle && profile && (
          <>
            <Section label="Your handle">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)' }}>@{myHandle.handle}</div>
                <button
                  type="button"
                  onClick={() => navigate(`/u/${myHandle.handle}`)}
                  style={{ ...secondaryBtn }}
                >
                  view profile <ExternalLink size={11} />
                </button>
              </div>
            </Section>

            <Section label="Visibility">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontSize: 14 }}>Profile is {profile.published ? 'public' : 'private'}</div>
                  <div style={{ color: 'var(--text-soft)', fontSize: 12, marginTop: 4 }}>
                    {profile.published ? 'Anyone with the link can view your canvas.' : 'Only you can see your profile right now.'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => saveProfile({ published: !profile.published })}
                  style={profile.published ? { ...secondaryBtn } : { ...primaryBtn }}
                >
                  {profile.published ? 'Unpublish' : 'Publish'}
                </button>
              </div>
            </Section>

            <Section label="Identity">
              <Field label="Display name">
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} onBlur={() => saveProfile({ display_name: displayName })} style={inputStyle} />
              </Field>
              <Field label="Short bio">
                <input value={bioShort} maxLength={140} onChange={(e) => setBioShort(e.target.value)} onBlur={() => saveProfile({ bio_short: bioShort })} style={inputStyle} placeholder="One line. Max 140 chars." />
                <Hint>{bioShort.length}/140</Hint>
              </Field>
              <Field label="Accent color">
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} onBlur={() => saveProfile({ accent_color: accent })} style={{ width: 36, height: 28, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-soft)' }}>{accent}</span>
                </div>
              </Field>
            </Section>

            <Section label="Edit your canvas">
              <p style={{ color: 'var(--text-soft)', fontSize: 13, lineHeight: 1.55, marginBottom: 12 }}>
                Place items, drag, resize, set your home view. Changes save as you go.
              </p>
              <button type="button" onClick={() => navigate(`/u/${myHandle.handle}/edit`)} style={primaryBtn}>
                Open canvas editor →
              </button>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28, padding: 22, background: 'var(--surface-1)', border: '1px solid var(--border-faint)', borderRadius: 14 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 'var(--track-mono)', color: 'var(--text-ghost)', textTransform: 'uppercase', marginBottom: 14 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 6, fontFamily: 'var(--font-mono)', letterSpacing: 'var(--track-mono)', textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  );
}
function Hint({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: 'var(--text-ghost)', marginTop: 6 }}>{children}</div>;
}

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', padding: '8px 10px', borderRadius: 8, fontSize: 13,
  fontFamily: 'inherit', outline: 'none',
};
const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'var(--luca-full)', color: '#1a1a1f', padding: '9px 14px', borderRadius: 999,
  border: '1px solid var(--luca-full)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
  fontFamily: 'var(--font-mono)', letterSpacing: 'var(--track-mono)', textTransform: 'uppercase',
};
const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'var(--surface-2)', color: 'var(--text-body)', padding: '9px 14px', borderRadius: 999,
  border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12,
  fontFamily: 'var(--font-mono)', letterSpacing: 'var(--track-mono)', textTransform: 'uppercase',
};
