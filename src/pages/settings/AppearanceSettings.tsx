import { useSettingsStore } from '@/stores/settingsStore';
import { useInterfaceModeStore } from '@/stores/interfaceModeStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { Toggle, RadioGroup } from '@/components/settings/FormControls';
import { Section } from '@/components/settings/Section';
import { Slider } from '@/components/settings/Slider';
import {
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';
import { shouldDefaultSidebarVisible, type InterfaceMode } from '@/lib/interfaceMode';

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

const MODE_OPTIONS: Array<{ value: InterfaceMode; label: string; hint: string }> = [
  {
    value: 'companion',
    label: 'Companion',
    hint: 'Chat-first. Only the four core surfaces (Chat, Notebook, Memory, Agents) are visible; the sidebar stays collapsed until you reach for it.',
  },
  {
    value: 'guided',
    label: 'Guided',
    hint: 'Recommended. Same four core surfaces, sidebar reachable in one click. Luca can point you to deeper surfaces by URL when they matter.',
  },
  {
    value: 'studio',
    label: 'Studio',
    hint: 'The complete Polyphonic workbench: Mind, Journal, Projects, Profile, and full settings depth in the rail. Sidebar open by default.',
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
  const interfaceMode = useInterfaceModeStore((s) => s.mode);
  const setInterfaceMode = useInterfaceModeStore((s) => s.setMode);
  const setSidebarVisible = useSidebarStore((s) => s.setVisible);

  const time = useClock();
  const handleModeChange = (mode: InterfaceMode) => {
    // setInterfaceMode now persists to both localStorage and user_settings;
    // fire-and-forget the Promise — the sidebar + rail react to the
    // synchronous store update immediately. DB write completes in the
    // background and survives reload + cross-device login.
    void setInterfaceMode(mode);
    setSidebarVisible(shouldDefaultSidebarVisible(mode));
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
          name="Mode"
          title="Interface mode"
          desc="Choose how much of Polyphonic is visible by default. The substrate stays the same; this only changes how much interface the app shows first."
        >
          <RadioGroup
            options={MODE_OPTIONS}
            value={interfaceMode}
            onChange={(v) => handleModeChange(v as InterfaceMode)}
          />
        </Section>

        <Section
          number="02"
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
          number="03"
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
          number="04"
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
