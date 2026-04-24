import { useSettingsStore } from '@/stores/settingsStore';
import {
  PageHeader,
  SectionTitle,
  SettingRow,
  Toggle,
  RadioGroup,
} from '@/components/settings/FormControls';

export default function AppearanceSettings() {
  const {
    font_size,
    clockbar_visible,
    show_agent_colors,
    show_timestamps,
    interface_density,
    updateSetting,
  } = useSettingsStore();

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <PageHeader
        folio="§ 09 / APPEARANCE"
        title="Appearance"
        description="Density, typography, and persistent surface visibility for the workspace."
      />

      <div style={{ padding: '0 32px 80px', maxWidth: 720 }}>
        <SectionTitle>Interface density</SectionTitle>
        <RadioGroup
          options={['Compact', 'Default', 'Comfortable']}
          value={interface_density}
          onChange={(v) => updateSetting('interface_density', v)}
        />

        <SectionTitle>Display</SectionTitle>
        <SettingRow label="Font size" description="Message text size">
          <div className="flex items-center gap-3 shrink-0">
            <input
              type="range"
              min={12}
              max={18}
              value={font_size}
              onChange={(e) => updateSetting('font_size', parseInt(e.target.value))}
              style={{
                width: 160,
                height: 3,
                borderRadius: 2,
                background: 'var(--bg-surface)',
                outline: 'none',
                appearance: 'none',
                cursor: 'pointer',
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                minWidth: 40,
                textAlign: 'right',
              }}
            >
              {font_size}px
            </span>
          </div>
        </SettingRow>
        <SettingRow label="Show timestamps" description="Display time on each message">
          <Toggle
            on={show_timestamps}
            onChange={() => updateSetting('show_timestamps', !show_timestamps)}
          />
        </SettingRow>
        <SettingRow label="Agent colors" description="Color-code agent names in chat">
          <Toggle
            on={show_agent_colors}
            onChange={() => updateSetting('show_agent_colors', !show_agent_colors)}
          />
        </SettingRow>
        <SettingRow label="Show clockbar" description="Persistent bottom time display">
          <Toggle
            on={clockbar_visible}
            onChange={() => updateSetting('clockbar_visible', !clockbar_visible)}
          />
        </SettingRow>
      </div>
    </div>
  );
}
