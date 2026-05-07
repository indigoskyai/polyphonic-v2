import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/integrations/supabase/client';
import {
  DangerButton,
  GhostButton,
  ConfirmDialog,
} from '@/components/settings/FormControls';
import { Section } from '@/components/settings/Section';
import {
  AccountRow,
  AccountPlanPill,
} from '@/components/settings/AccountRow';
import {
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';

export default function AccountSettings() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const time = useClock();

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOut();
    } catch (error) {
      setSignOutError(
        error instanceof Error
          ? error.message
          : 'Could not sign out. Please try again.',
      );
      setSigningOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      // Edge function does the work: verifies our JWT, then calls
      // supabase.auth.admin.deleteUser() with the service role key.
      // FK CASCADE on auth.users handles all the user-owned rows.
      const { data, error } = await supabase.functions.invoke('delete-user', {
        method: 'POST',
      });

      if (error) {
        throw new Error(
          error.message || 'Could not delete your account.',
        );
      }
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error));
      }

      // Clean up the local session and bounce to the landing.
      try {
        await supabase.auth.signOut();
      } catch {
        // Even if local signOut fails, the server-side user is gone
        // and the JWT will be rejected on the next request — proceed.
      }
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? err.message
          : 'Could not delete your account. Please try again.',
      );
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <SettingsPage
      folio={{
        left: (
          <>
            <span>
              <AgentDot /> luca
            </span>
            <span>
              settings · <span className="v">account</span>
            </span>
          </>
        ),
        right: (
          <>
            <span>pro plan</span>
            <span>{time}</span>
          </>
        ),
      }}
    >
      <div className="set-head">
        <div className="set-head-eye">
          <span className="num">§ 09 / 09</span>
          <span>·</span>
          <span className="v">Sign-in & subscription</span>
        </div>
        <h1 className="set-head-title">Account &amp; preferences</h1>
        <p className="set-head-sub">
          Sign-in identity, plan, and destructive account actions. Most
          account-level settings happen here.
        </p>
      </div>

      <div className="set-body">
        <Section
          number="01"
          name="Identity"
          title="Sign-in & subscription"
          desc="The email tied to this workspace and the plan currently authorizing access."
        >
          <AccountRow
            label="Email"
            description="Used for sign-in and account-critical notifications."
            value={user?.email ?? '—'}
          />
          <AccountRow
            label="Plan"
            description="Current subscription tier. Manage billing in the customer portal."
            value={<AccountPlanPill label="Pro" />}
          />
        </Section>

        <Section
          number="02"
          name="Sessions"
          title="Sign out of this workspace"
          desc="End your session on this device. Your data and connected runtimes are unaffected."
        >
          <div style={{ marginTop: 4 }}>
            <GhostButton
              label={signingOut ? 'Signing out…' : 'Sign out'}
              onClick={handleSignOut}
              disabled={signingOut}
            />
            {signOutError && (
              <p
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: 'var(--rose-accent, #c97c8a)',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: 'var(--track-body-tight)',
                }}
              >
                {signOutError}
              </p>
            )}
          </div>
        </Section>

        <Section
          number="03"
          name="Destructive"
          title="Delete account"
          desc="Permanently removes your account, all engrams, all paired runtimes, and all connected services. This cannot be undone and we cannot recover deleted data."
          destructive
        >
          <div style={{ marginTop: 4 }}>
            <DangerButton
              label={deleting ? 'Deleting…' : 'Delete account'}
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
            />
            {deleteError && (
              <p
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: 'var(--rose-accent, #c97c8a)',
                  fontFamily: 'var(--font-sans)',
                  letterSpacing: 'var(--track-body-tight)',
                }}
              >
                {deleteError}
              </p>
            )}
          </div>
        </Section>

        {showDeleteConfirm && (
          <ConfirmDialog
            title="Delete account"
            message="This will permanently delete your account and all associated data. This cannot be undone."
            confirmLabel={deleting ? 'Deleting…' : 'Delete account'}
            onConfirm={handleDeleteAccount}
            onCancel={() => {
              if (!deleting) setShowDeleteConfirm(false);
            }}
          />
        )}
      </div>
    </SettingsPage>
  );
}
