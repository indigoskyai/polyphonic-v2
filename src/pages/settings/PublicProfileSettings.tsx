import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Section } from '@/components/settings/Section';
import { AccountPlanPill, AccountRow, HandlePreview } from '@/components/settings/AccountRow';
import {
  GhostButton,
  PrimaryButton,
  SettingRow,
  TextArea,
  TextInput,
  Toggle,
} from '@/components/settings/FormControls';
import {
  SaveFooter,
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';
import { useAuthStore } from '@/stores/authStore';
import { isValidHandle, normalizeHandle, useHandleStore } from '@/stores/handleStore';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type PublicProfileForm = {
  display_name: string;
  bio_short: string;
  bio_long: string;
  accent_color: string;
  published: boolean;
};

const DEFAULT_FORM: PublicProfileForm = {
  display_name: '',
  bio_short: '',
  bio_long: '',
  accent_color: '#c9a87c',
  published: false,
};

function formEquals(a: PublicProfileForm | null, b: PublicProfileForm): boolean {
  if (!a) return false;
  return a.display_name === b.display_name
    && a.bio_short === b.bio_short
    && a.bio_long === b.bio_long
    && a.accent_color === b.accent_color
    && a.published === b.published;
}

function validAccent(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export default function PublicProfileSettings() {
  const user = useAuthStore((s) => s.user);
  const myHandle = useHandleStore((s) => s.myHandle);
  const loadHandles = useHandleStore((s) => s.load);
  const claimUserHandle = useHandleStore((s) => s.claimUserHandle);
  const navigate = useNavigate();
  const { toast } = useToast();
  const time = useClock();
  const [claimHandle, setClaimHandle] = useState('');
  const [claimDisplayName, setClaimDisplayName] = useState('');
  const [form, setForm] = useState<PublicProfileForm>(DEFAULT_FORM);
  const [baseline, setBaseline] = useState<PublicProfileForm | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!user) return;
    void loadHandles(user.id);
    const seed = normalizeHandle(user.email?.split('@')[0] || 'yourhandle');
    setClaimHandle(seed);
    setClaimDisplayName(user.email?.split('@')[0] || '');
  }, [user, loadHandles]);

  useEffect(() => {
    if (!myHandle) {
      setForm(DEFAULT_FORM);
      setBaseline(null);
      return;
    }
    let cancelled = false;
    setLoadingProfile(true);
    (supabase as any)
      .from('profiles_public')
      .select('display_name,bio_short,bio_long,accent_color,published')
      .eq('handle', myHandle.handle)
      .maybeSingle()
      .then(({ data }: { data: Partial<PublicProfileForm> | null }) => {
        if (cancelled) return;
        const next = {
          display_name: data?.display_name || myHandle.handle,
          bio_short: data?.bio_short || '',
          bio_long: data?.bio_long || '',
          accent_color: validAccent(data?.accent_color || '') ? data!.accent_color! : '#c9a87c',
          published: Boolean(data?.published),
        };
        setForm(next);
        setBaseline(next);
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });
    return () => { cancelled = true; };
  }, [myHandle]);

  const normalizedClaim = useMemo(() => normalizeHandle(claimHandle), [claimHandle]);
  const canClaim = isValidHandle(normalizedClaim) && Boolean(claimDisplayName.trim());
  const dirty = useMemo(() => Boolean(myHandle && baseline && !formEquals(baseline, form)), [baseline, form, myHandle]);
  const publicPath = myHandle ? `/u/${myHandle.handle}` : '';

  async function handleClaim() {
    if (!canClaim) return;
    setClaiming(true);
    const result = await claimUserHandle(normalizedClaim, claimDisplayName.trim());
    setClaiming(false);
    if (!result.ok) {
      toast({ title: 'Handle not claimed', description: result.error });
      return;
    }
    toast({ title: 'Handle claimed', description: `@${normalizedClaim} is ready.` });
    if (user) await loadHandles(user.id);
  }

  async function handleSave() {
    if (!myHandle || saving) return;
    if (!validAccent(form.accent_color)) {
      toast({ title: 'Invalid accent color', description: 'Use a full hex value like #c9a87c.' });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any)
      .from('profiles_public')
      .update({
        display_name: form.display_name.trim() || myHandle.handle,
        bio_short: form.bio_short.trim(),
        bio_long: form.bio_long.trim(),
        accent_color: form.accent_color,
        published: form.published,
      })
      .eq('handle', myHandle.handle);
    setSaving(false);
    if (error) {
      toast({ title: 'Profile not saved', description: error.message });
      return;
    }
    const next = {
      ...form,
      display_name: form.display_name.trim() || myHandle.handle,
      bio_short: form.bio_short.trim(),
      bio_long: form.bio_long.trim(),
    };
    setForm(next);
    setBaseline(next);
    toast({ title: 'Profile saved', description: `@${myHandle.handle} is updated.` });
  }

  function handleDiscard() {
    if (baseline) setForm(baseline);
  }

  return (
    <SettingsPage
      folio={{
        left: (
          <>
            <span>
              <AgentDot /> luca
            </span>
            <span>
              profile · <span className="v">public</span>
            </span>
          </>
        ),
        right: (
          <>
            <span>{myHandle ? (form.published ? 'published' : 'draft') : 'unclaimed'}</span>
            <span>{time}</span>
          </>
        ),
      }}
      footer={(
        <SaveFooter
          dirty={dirty}
          saving={saving}
          onDiscard={handleDiscard}
          onSave={handleSave}
        />
      )}
    >
      <div className="set-head">
        <div className="set-head-eye">
          <span className="num">§ 04 / 01</span>
          <span>·</span>
          <span className="v">Social intelligence</span>
        </div>
        <h1 className="set-head-title">Public profile</h1>
        <p className="set-head-sub">
          A profile frame for public artifacts, research notes, projects, and the signals other builders can discover.
        </p>
      </div>

      <div className="set-body">
        {!myHandle ? (
          <Section
            number="01"
            name="Claim"
            title="Choose your public handle"
            desc="Your handle becomes the stable URL for your public frame and canvas."
          >
            <SettingRow label="Handle" description="Lowercase letters, numbers, and underscores.">
              <TextInput value={claimHandle} onChange={(value) => setClaimHandle(normalizeHandle(value))} mono />
            </SettingRow>
            <SettingRow label="Display name" description="Shown at the top of the public profile.">
              <TextInput value={claimDisplayName} onChange={setClaimDisplayName} />
            </SettingRow>
            <div style={{ paddingTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <PrimaryButton label={claiming ? 'Claiming...' : 'Claim handle'} onClick={handleClaim} disabled={!canClaim || claiming} />
            </div>
          </Section>
        ) : (
          <>
            <Section
              number="01"
              name="Address"
              title="Profile URL"
              desc="This is the public address for the profile frame and canvas."
            >
              <AccountRow
                label="Handle"
                description="The public namespace shared by people and agents."
                value={<AccountPlanPill label={form.published ? 'published' : 'draft'} />}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '14px 0' }}>
                <HandlePreview domain="polyphonic.app/u/" handle={myHandle.handle} />
                <GhostButton label="Open frame" onClick={() => navigate(publicPath)} />
                <GhostButton label="Edit canvas" onClick={() => navigate(`${publicPath}/edit`)} />
              </div>
            </Section>

            <Section
              number="02"
              name="Identity"
              title="Profile copy"
              desc="Keep this lightweight. The artifacts carry the depth; the copy orients the room."
            >
              {loadingProfile ? (
                <div style={{ color: 'var(--text-soft)', fontSize: 13, padding: '18px 0' }}>Loading profile...</div>
              ) : (
                <>
                  <SettingRow label="Display name">
                    <TextInput
                      value={form.display_name}
                      onChange={(display_name) => setForm((current) => ({ ...current, display_name }))}
                    />
                  </SettingRow>
                  <SettingRow label="Short bio" description="A compact sentence for the sidebar and hero.">
                    <TextArea
                      rows={3}
                      value={form.bio_short}
                      onChange={(bio_short) => setForm((current) => ({ ...current, bio_short }))}
                    />
                  </SettingRow>
                  <SettingRow label="Long bio" description="Markdown is supported on the public frame.">
                    <TextArea
                      rows={7}
                      value={form.bio_long}
                      onChange={(bio_long) => setForm((current) => ({ ...current, bio_long }))}
                      mono
                    />
                  </SettingRow>
                  <SettingRow label="Accent" description="Used sparingly for identity and active signals.">
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
                      <input
                        aria-label="Profile accent color"
                        type="color"
                        value={validAccent(form.accent_color) ? form.accent_color : '#c9a87c'}
                        onChange={(event) => setForm((current) => ({ ...current, accent_color: event.target.value }))}
                        style={{
                          width: 40,
                          height: 40,
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--surface-1)',
                          padding: 4,
                          flex: '0 0 auto',
                        }}
                      />
                      <TextInput
                        value={form.accent_color}
                        onChange={(accent_color) => setForm((current) => ({ ...current, accent_color }))}
                        mono
                      />
                    </div>
                  </SettingRow>
                  <SettingRow label="Publish profile" description="When off, only you can see the profile.">
                    <Toggle
                      on={form.published}
                      onChange={() => setForm((current) => ({ ...current, published: !current.published }))}
                    />
                  </SettingRow>
                </>
              )}
            </Section>
          </>
        )}
      </div>
    </SettingsPage>
  );
}
