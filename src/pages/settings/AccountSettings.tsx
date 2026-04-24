import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import {
  PageHeader,
  SectionTitle,
  SettingRow,
  DangerButton,
  GhostButton,
  ConfirmDialog,
} from '@/components/settings/FormControls';

export default function AccountSettings() {
  const { user, signOut } = useAuthStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <PageHeader
        folio="§ 09 / ACCOUNT"
        title="Account & preferences"
        description="Sign-in identity, plan, and destructive account actions."
      />

      <div style={{ padding: '0 32px 80px', maxWidth: 720 }}>
        <SectionTitle>Account</SectionTitle>
        <SettingRow label="Email" description="Your account email">
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{user?.email}</span>
        </SettingRow>
        <SettingRow label="Plan" description="Current subscription">
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '3px 10px',
              borderRadius: 100,
              background: 'var(--bg-surface)',
              color: 'var(--luca)',
              border: '1px solid var(--border)',
            }}
          >
            pro
          </span>
        </SettingRow>

        <div className="mt-8 flex items-center gap-4">
          <GhostButton label="Sign out" onClick={signOut} />
          <DangerButton label="Delete account" onClick={() => setShowDeleteConfirm(true)} />
        </div>

        {showDeleteConfirm && (
          <ConfirmDialog
            title="Delete account"
            message="This will permanently delete your account and all associated data. This cannot be undone."
            onConfirm={() => setShowDeleteConfirm(false)}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}
