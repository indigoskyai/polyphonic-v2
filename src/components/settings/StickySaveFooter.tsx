import React from 'react';
import { Pill } from '@/components/ui/luca';
import { useAgentSettingsStore } from '@/stores/agentSettingsStore';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';

interface Props {
  agentId: string;
}

export default function StickySaveFooter({ agentId }: Props) {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const dirty = useAgentSettingsStore((s) => s.isDirty(agentId));
  const discard = useAgentSettingsStore((s) => s.discard);
  const save = useAgentSettingsStore((s) => s.save);
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const res = await save(agentId, user.id);
    setSaving(false);
    if (res.ok) {
      toast({ title: 'Saved', description: 'Agent configuration updated.' });
    } else {
      toast({ title: 'Save failed', description: res.error ?? 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <div className="footer-bar">
      <span className={`fb-status${dirty ? ' fb-dirty' : ''}`}>
        {dirty ? 'unsaved changes' : 'all changes saved'}
      </span>
      <div className="fb-actions">
        <Pill variant="ghost" size="sm" disabled={!dirty || saving} onClick={() => discard(agentId)}>Discard</Pill>
        <Pill variant="primary" size="sm" disabled={!dirty || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save'}
        </Pill>
      </div>
    </div>
  );
}
