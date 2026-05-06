import { useSettingsStore } from '@/stores/settingsStore';
import { Toggle, RadioGroup } from '@/components/settings/FormControls';
import { Section } from '@/components/settings/Section';
import { Slider } from '@/components/settings/Slider';
import {
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';

const DENSITY_OPTIONS = [
  {
    value: 'compact',
    label: 'Compact',
    hint: 'Maximum density. Useful on smaller displays.',
  },
  {
    value: 'default',
    label: 'Default',
    hint: 'Balanced spacing. The recommended setting.',
  },
  {
    value: 'comfortable',
    label: 'Comfortable',
    hint: 'Extra breathing room between elements.',
  },
];

export default function AppearanceSettings() {
  const {
    font_size,
    clockbar_visible,
    show_agent_colors,
    show_timestamps,
    interface_density,
    updateSetting,
  } = useSettingsStore();

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
              settings · <span className="v">appearance</span>
            </span>
          </>
        ),
        right: (
          <>
            <span>opus 4.7</span>
            <span>{time}</span>
          </>
        ),
      }}
    >
      <div className="set-head">
        <div className="set-head-eye">
          <span className="num">§ 09 / 03</span>
          <span>·</span>
          <span className="v">Workspace presentation</span>
        </div>
        <h1 className="set-head-title">Appearance</h1>
        <p className="set-head-sub">
          Density, typography, and persistent surface visibility for the
          workspace.
        </p>
      </div>

      <div className="set-body">
        <Section
          number="01"
          name="Layout"
          title="Interface density"
          desc="How tightly content packs into each surface. Comfortable adds breathing room; compact maximizes information per screen."
        >
          <RadioGroup
            options={DENSITY_OPTIONS}
            value={interface_density}
            onChange={(v) => updateSetting('interface_density', v)}
          />
        </Section>

        <Section
          number="02"
          name="Typography"
          title="Font size"
          desc="Base size for message and reading text. Code blocks scale proportionally."
        >
          <div className="set-row">
            <div className="set-row-copy">
              <div className="set-row-label">Message font size</div>
              <div className="set-row-desc">
                Adjust between 12 and 18 pixels.
              </div>
            </div>
            <div className="set-row-control">
              <Slider
                value={font_size}
                min={12}
                max={18}
                suffix="px"
                ariaLabel="Message font size"
                onChange={(v) => updateSetting('font_size', v)}
              />
            </div>
          </div>
        </Section>

        <Section
          number="03"
          name="Display"
          title="Surface visibility"
          desc="What stays visible across views. Each control persists until toggled."
        >
          <div className="set-row">
            <div className="set-row-copy">
              <div className="set-row-label">Show timestamps</div>
              <div className="set-row-desc">Display time on each message.</div>
            </div>
            <div className="set-row-control">
              <Toggle
                on={show_timestamps}
                onChange={() =>
                  updateSetting('show_timestamps', !show_timestamps)
                }
              />
            </div>
          </div>
          <div className="set-row">
            <div className="set-row-copy">
              <div className="set-row-label">Agent colors</div>
              <div className="set-row-desc">Color-code agent names in chat.</div>
            </div>
            <div className="set-row-control">
              <Toggle
                on={show_agent_colors}
                onChange={() =>
                  updateSetting('show_agent_colors', !show_agent_colors)
                }
              />
            </div>
          </div>
          <div className="set-row">
            <div className="set-row-copy">
              <div className="set-row-label">Show clockbar</div>
              <div className="set-row-desc">Persistent bottom time display.</div>
            </div>
            <div className="set-row-control">
              <Toggle
                on={clockbar_visible}
                onChange={() =>
                  updateSetting('clockbar_visible', !clockbar_visible)
                }
              />
            </div>
          </div>
        </Section>
      </div>
    </SettingsPage>
  );
}
