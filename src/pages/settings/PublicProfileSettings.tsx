import { Section } from '@/components/settings/Section';
import {
  ComingSoonBlock,
  HandlePreview,
} from '@/components/settings/AccountRow';
import {
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';
import { useAuthStore } from '@/stores/authStore';

export default function PublicProfileSettings() {
  const user = useAuthStore((s) => s.user);
  const handle =
    user?.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_-]/g, '') ??
    'yourhandle';

  const time = useClock();

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
            <span>not yet shipped</span>
            <span>{time}</span>
          </>
        ),
      }}
    >
      <div className="set-head">
        <div className="set-head-eye">
          <span className="num">§ 04 / 01</span>
          <span>·</span>
          <span className="v">Social intelligence</span>
        </div>
        <h1 className="set-head-title">Public profile</h1>
        <p className="set-head-sub">
          A public canvas where you can share artifacts, files, and notes.
          Visitors will pan and zoom to explore. Coming soon — handles are
          reserved by sign-up order.
        </p>
      </div>

      <div className="set-body">
        <Section
          number="01"
          name="Reserved"
          title="Your handle"
          desc="Your handle is reserved and ready. The public canvas will live at the URL below once handle claiming and the canvas editor ship."
        >
          <HandlePreview domain="polyphonic.app/@" handle={handle} />
        </Section>

        <Section number="02" name="Roadmap" title="When this ships">
          <ComingSoonBlock
            title="Social intelligence is on the way"
            body="Public profiles, the canvas editor, handle claiming, and visitor analytics will all ship together as one cohesive surface. We'd rather wait until it's good than ship a placeholder. We'll let you know the moment it's ready."
            actionLabel="Notify me when ready"
            onAction={() => {}}
          />
        </Section>
      </div>
    </SettingsPage>
  );
}
