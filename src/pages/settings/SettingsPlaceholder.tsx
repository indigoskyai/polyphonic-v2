import { Section } from '@/components/settings/Section';
import { ComingSoonBlock } from '@/components/settings/AccountRow';
import {
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';

/**
 * Shared placeholder page for settings categories that haven't been
 * ported yet. Renders the canonical settings page-header pattern + a
 * single coming-soon block.
 *
 * Used by /settings/voice (Voice & security) and any other settings
 * route that's not yet implemented.
 */
interface Props {
  eyebrow: string; // e.g. "§ 09 / VOICE & SECURITY"
  title: string; // e.g. "Voice & security"
  description?: string;
  surfacePath?: string; // e.g. "voice & security" — appears in folio
  body?: string;
}

export default function SettingsPlaceholder({
  eyebrow,
  title,
  description,
  surfacePath,
  body,
}: Props) {
  const time = useClock();
  const folioPath = surfacePath ?? title.toLowerCase();

  return (
    <SettingsPage
      folio={{
        left: (
          <>
            <span>
              <AgentDot /> luca
            </span>
            <span>
              settings · <span className="v">{folioPath}</span>
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
          <span className="num">{eyebrow}</span>
        </div>
        <h1 className="set-head-title">{title}</h1>
        {description && <p className="set-head-sub">{description}</p>}
      </div>

      <div className="set-body">
        <Section
          number="01"
          name="Roadmap"
          title="When this ships"
        >
          <ComingSoonBlock
            title={`${title} is on the way`}
            body={
              body ??
              `${title} will ship as a single cohesive surface. We'd rather wait until it's good than ship a placeholder. We'll let you know the moment it's ready.`
            }
            actionLabel="Notify me when ready"
            onAction={() => {}}
          />
        </Section>
      </div>
    </SettingsPage>
  );
}
