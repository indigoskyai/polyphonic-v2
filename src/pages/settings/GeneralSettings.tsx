import { useSettingsStore } from '@/stores/settingsStore';
import {
  PageHeader,
  SectionTitle,
  SettingRow,
  Toggle,
  RadioGroup,
  SelectInput,
} from '@/components/settings/FormControls';

const MODEL_OPTIONS = [
  { label: 'Claude Opus 4.7', value: 'anthropic/claude-opus-4.7' },
  { label: 'Claude Opus 4.6', value: 'anthropic/claude-opus-4.6' },
  { label: 'Claude Sonnet 4.6', value: 'anthropic/claude-sonnet-4.6' },
  { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5' },
  { label: 'GPT-5.4', value: 'openai/gpt-5.4' },
  { label: 'GPT-5.4 Mini', value: 'openai/gpt-5.4-mini' },
  { label: 'GPT-5.4 Pro', value: 'openai/gpt-5.4-pro' },
  { label: 'GPT-5.3 Chat', value: 'openai/gpt-5.3-chat' },
  { label: 'GPT-5.2', value: 'openai/gpt-5.2' },
  { label: 'Gemini 3.1 Pro', value: 'google/gemini-3.1-pro-preview' },
  { label: 'Gemini 3 Flash', value: 'google/gemini-3-flash-preview' },
  { label: 'Gemini 2.5 Pro', value: 'google/gemini-2.5-pro' },
  { label: 'Gemini 2.5 Flash', value: 'google/gemini-2.5-flash' },
  { label: 'Grok 4.20', value: 'x-ai/grok-4.20' },
  { label: 'Grok 4.1 Fast', value: 'x-ai/grok-4.1-fast' },
  { label: 'DeepSeek V3.2', value: 'deepseek/deepseek-v3.2' },
  { label: 'Llama 4 Maverick', value: 'meta-llama/llama-4-maverick' },
  { label: 'Qwen3 Max', value: 'qwen/qwen3-max' },
];

export default function GeneralSettings() {
  const {
    stream_responses,
    show_thinking,
    auto_title,
    default_model,
    synthesis_style,
    updateSetting,
  } = useSettingsStore();

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <PageHeader
        folio="§ 09 / GENERAL"
        title="General"
        description="Default model selection, synthesis style, and how responses are streamed back to you."
      />

      <div style={{ padding: '0 32px 80px', maxWidth: 720 }}>
        <SectionTitle>Default model</SectionTitle>
        <SelectInput
          value={default_model}
          onChange={(v) => updateSetting('default_model', v)}
          options={MODEL_OPTIONS}
          width="100%"
        />

        <SectionTitle>Synthesis style</SectionTitle>
        <RadioGroup
          options={['Conversational', 'Technical', 'Creative', 'Minimal']}
          value={synthesis_style}
          onChange={(v) => updateSetting('synthesis_style', v)}
        />

        <SectionTitle>Response behavior</SectionTitle>
        <SettingRow label="Stream responses" description="Show tokens as they arrive">
          <Toggle
            on={stream_responses}
            onChange={() => updateSetting('stream_responses', !stream_responses)}
          />
        </SettingRow>
        <SettingRow label="Show thinking" description="Display the model's internal reasoning">
          <Toggle
            on={show_thinking}
            onChange={() => updateSetting('show_thinking', !show_thinking)}
          />
        </SettingRow>
        <SettingRow label="Auto-title threads" description="Generate titles from first message">
          <Toggle on={auto_title} onChange={() => updateSetting('auto_title', !auto_title)} />
        </SettingRow>
      </div>
    </div>
  );
}
