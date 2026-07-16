import { Link } from 'react-router-dom';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  SelectInput,
  Toggle,
} from '@/components/settings/FormControls';
import { Section } from '@/components/settings/Section';
import {
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';
import { RadioGroup } from '@/components/settings/FormControls';

const MODEL_OPTIONS = [
  { label: 'Kimi K3', value: 'moonshotai/kimi-k3' },
  { label: 'Kimi K2.7 Code', value: 'moonshotai/kimi-k2.7-code' },
  { label: 'Kimi K2.6', value: 'moonshotai/kimi-k2.6' },
  { label: 'Claude Opus 4.8', value: 'anthropic/claude-opus-4.8' },
  { label: 'Claude Opus 4.7', value: 'anthropic/claude-opus-4-7' },
  { label: 'Claude Opus 4.6', value: 'anthropic/claude-opus-4.6' },
  { label: 'Claude Opus 4.5', value: 'anthropic/claude-opus-4.5' },
  { label: 'Claude Opus 4.1', value: 'anthropic/claude-opus-4.1' },
  { label: 'Claude Sonnet 4.6', value: 'anthropic/claude-sonnet-4.6' },
  { label: 'Claude Sonnet 4.5', value: 'anthropic/claude-sonnet-4.5' },
  { label: 'Claude Haiku 4.5', value: 'anthropic/claude-haiku-4.5' },
  { label: 'GPT-5.5', value: 'openai/gpt-5.5' },
  { label: 'GPT-5.4', value: 'openai/gpt-5.4' },
  { label: 'GPT-5.4 Mini', value: 'openai/gpt-5.4-mini' },
  { label: 'GPT-5.4 Pro', value: 'openai/gpt-5.4-pro' },
  { label: 'GPT-5.3 Chat', value: 'openai/gpt-5.3-chat' },
  { label: 'GPT-5.2', value: 'openai/gpt-5.2' },
  { label: 'GPT-5.1', value: 'openai/gpt-5.1' },
  { label: 'Gemini 3.1 Pro', value: 'google/gemini-3.1-pro-preview' },
  { label: 'Gemini 3 Flash', value: 'google/gemini-3-flash-preview' },
  { label: 'Gemini 2.5 Pro', value: 'google/gemini-2.5-pro' },
  { label: 'Gemini 2.5 Flash', value: 'google/gemini-2.5-flash' },
  { label: 'Grok 4.20', value: 'x-ai/grok-4.20' },
  { label: 'Grok 4.1 Fast', value: 'x-ai/grok-4.1-fast' },
  { label: 'DeepSeek V4 Pro', value: 'deepseek/deepseek-v4-pro' },
  { label: 'DeepSeek V4 Flash', value: 'deepseek/deepseek-v4-flash' },
  { label: 'DeepSeek V3.2', value: 'deepseek/deepseek-v3.2' },
  { label: 'Kimi K2.5', value: 'moonshotai/kimi-k2.5' },
  { label: 'Llama 4 Maverick', value: 'meta-llama/llama-4-maverick' },
  { label: 'Qwen3 Max', value: 'qwen/qwen3-max' },
];

const SYNTHESIS_OPTIONS = [
  {
    value: 'conversational',
    label: 'Conversational',
    hint: 'Warm, plain-language replies. The default.',
  },
  {
    value: 'technical',
    label: 'Technical',
    hint: 'Precise, code-fluent. Skips small talk.',
  },
  {
    value: 'creative',
    label: 'Creative',
    hint: 'Reaches for metaphor, plays with structure.',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    hint: 'Shortest path to a useful answer.',
  },
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
              settings · <span className="v">general</span>
            </span>
          </>
        ),
        right: (
          <>
            <span>{default_model.split('/').pop() ?? default_model}</span>
            <span>{time}</span>
          </>
        ),
      }}
    >
      <div className="set-head">
        <div className="set-head-eye">
          <span className="num">§ 09 / 01</span>
          <span>·</span>
          <span className="v">Default behavior</span>
        </div>
        <h1 className="set-head-title">General</h1>
        <p className="set-head-sub">
          Default model selection, synthesis style, and how responses are
          streamed back to you. New here? The guide explains the full app map.
        </p>
      </div>

      <div className="set-body">
        <Section
          number="01"
          name="Default model"
          title="Reasoning model"
          desc="The model used for new threads when no agent-specific override exists."
        >
          <SelectInput
            value={default_model}
            onChange={(v) => updateSetting('default_model', v)}
            options={MODEL_OPTIONS}
            width="100%"
          />
        </Section>

        <Section
          number="02"
          name="Synthesis style"
          title="Voice & register"
          desc="How responses sound. Affects tone, length, and structure across all agents."
        >
          <RadioGroup
            options={SYNTHESIS_OPTIONS}
            value={synthesis_style}
            onChange={(v) => updateSetting('synthesis_style', v)}
          />
        </Section>

        <Section
          number="03"
          name="Response behavior"
          title="Streaming & display"
          desc="How tokens render and threads are titled."
        >
          <div className="set-row">
            <div className="set-row-copy">
              <div className="set-row-label">Stream responses</div>
              <div className="set-row-desc">
                Show tokens as they arrive rather than waiting for the full
                response.
              </div>
            </div>
            <div className="set-row-control">
              <Toggle
                on={stream_responses}
                onChange={() => updateSetting('stream_responses', !stream_responses)}
              />
            </div>
          </div>
          <div className="set-row">
            <div className="set-row-copy">
              <div className="set-row-label">Show thinking</div>
              <div className="set-row-desc">
                Display the model's internal reasoning when available.
              </div>
            </div>
            <div className="set-row-control">
              <Toggle
                on={show_thinking}
                onChange={() => updateSetting('show_thinking', !show_thinking)}
              />
            </div>
          </div>
          <div className="set-row">
            <div className="set-row-copy">
              <div className="set-row-label">Auto-title threads</div>
              <div className="set-row-desc">
                Generate thread titles from the first message.
              </div>
            </div>
            <div className="set-row-control">
              <Toggle
                on={auto_title}
                onChange={() => updateSetting('auto_title', !auto_title)}
              />
            </div>
          </div>
        </Section>

        <Section
          number="04"
          name="Guide"
          title="Need orientation?"
          desc="A practical map of Polyphonic, including API keys, agents, memory, Journal, Mind, Observer, import, and troubleshooting."
        >
          <Link className="set-btn" to="/settings/help">
            Open guide
          </Link>
        </Section>
      </div>
    </SettingsPage>
  );
}
