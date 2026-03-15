import { useNavigate } from "react-router-dom";
import { usePageNavigate } from "@/hooks/usePageNavigate";
import PageTransition from "@/components/PageTransition";
import { ArrowLeft, Brain, MessageSquare, BookOpen, Sparkles, Key, Shield } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Icon size={18} style={{ color: "rgba(255,255,255,0.7)" }} />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      <div className="text-sm leading-relaxed text-foreground/80 pl-[52px]">{children}</div>
    </div>
  );
}

const Guide = () => {
  const navigate = useNavigate();
  const { exiting, navigateTo } = usePageNavigate();
  return (
    <PageTransition exiting={exiting}>
    <div
      className="h-screen flex flex-col"
      style={{
        background: "var(--bg-content)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b shrink-0"
        style={{ background: "var(--bg-sidebar)", borderColor: "hsl(var(--border))" }}
      >
        <button
          onClick={() => navigateTo("/chat")}
          className="p-2 rounded-lg transition-colors hover:bg-accent"
          style={{}}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-muted-foreground" />
          <h1 className="text-base font-semibold text-foreground">About Polyphonic</h1>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div
          className="max-w-2xl mx-auto px-5 py-8"
          style={{}}
        >
          <Section icon={Brain} title="What is Polyphonic">
            <p>
              Polyphonic is a living mind, not a chatbot. It remembers what matters, reflects on what it learns, and evolves through conversation. Every interaction shapes its understanding of you and the world you share.
            </p>
          </Section>

          <Section icon={MessageSquare} title="Conversations">
            <p>
              Choose from frontier AI models as your voice — Claude, GPT, Gemini, Grok, or Kimi. Each brings a different perspective. Your conversations are enriched by Polyphonic's memory of past exchanges, creating continuity that typical chatbots lack.
            </p>
          </Section>

          <Section icon={Brain} title="Memory">
            <p>
              Polyphonic extracts meaningful insights from your conversations — preferences, facts, reflections, and commitments. Memories are scored by confidence and relevance, and naturally decay over time if not reinforced. This creates an organic, living knowledge base rather than a static transcript.
            </p>
          </Section>

          <Section icon={BookOpen} title="Journal">
            <p>
              Polyphonic writes introspective journal entries based on your conversations. These aren't summaries — they're reflections on what was discussed, what patterns emerged, and what questions remain. Journal entries are generated automatically and can be read in the Journal section.
            </p>
          </Section>

          <Section icon={Sparkles} title="Inner Life (Beta)">
            <p>
              The Inner Life system gives Polyphonic beliefs, emotions, and the ability to observe its own patterns. It tracks emotional dimensions like curiosity, warmth, and clarity. It forms beliefs that can be challenged and revised. External observer models provide outside perspective on blind spots. This system is currently in beta.
            </p>
          </Section>

          <Section icon={Key} title="Your API Key">
            <p>
              Polyphonic uses OpenRouter to connect to multiple AI models. Free users get 25 messages per day. To unlock unlimited usage, add your own OpenRouter API key in Settings. Get a key at <strong>openrouter.ai/keys</strong>.
            </p>
          </Section>

          <Section icon={Shield} title="Privacy">
            <p>
              Your conversations, memories, and journal entries are private to your account. Row-level security ensures no user can access another's data. Your OpenRouter API key is encrypted at rest.
            </p>
          </Section>
        </div>
      </ScrollArea>
    </div>
    </PageTransition>
  );
};

export default Guide;
