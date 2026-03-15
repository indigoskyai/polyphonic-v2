import { useNavigate } from "react-router-dom";
import { useUserSettings } from "@/hooks/useUserSettings";
import { usePageNavigate } from "@/hooks/usePageNavigate";
import PageTransition from "@/components/PageTransition";
import { getBackgroundStyle } from "@/lib/backgrounds";
import { GLASS_STYLE } from "@/lib/glassmorphism";
import { ArrowLeft, MessageSquare, Brain, Key, Thermometer, ScrollText, Shield, Sparkles, HelpCircle, BookOpen, Layers } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

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
  const { settings } = useUserSettings();
  const bgStyle = getBackgroundStyle(settings?.background_style);
  const hasCustomBg = !!bgStyle;

  return (
    <PageTransition exiting={exiting}>
    <div
      className="h-screen flex flex-col"
      style={{
        background: hasCustomBg ? undefined : "var(--bg-content)",
        ...(bgStyle || {}),
      }}
      {...(hasCustomBg ? { "data-custom-bg": "" } : {})}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b shrink-0"
        style={hasCustomBg ? { ...GLASS_STYLE, borderRadius: 0, borderLeft: "none", borderRight: "none", borderTop: "none" } : { background: "var(--bg-sidebar)", borderColor: "hsl(var(--border))" }}
      >
        <button
          onClick={() => navigateTo("/chat")}
          className="p-2 rounded-lg transition-colors hover:bg-accent"
          style={hasCustomBg ? { color: "rgba(255,255,255,0.7)" } : {}}
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          <BookOpen size={18} className="text-muted-foreground" />
          <h1 className="text-base font-semibold text-foreground">How Polyphonic Works</h1>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div
          className="max-w-2xl mx-auto px-5 py-8"
          style={hasCustomBg ? {
            margin: "24px auto",
            padding: "32px 28px",
            borderRadius: "16px",
            ...GLASS_STYLE,
          } : {}}
        >
          {/* Intro */}
          <div className="mb-10">
            <p className="text-sm text-foreground/80 leading-relaxed">
              Welcome! This page explains everything you need to know about using Polyphonic. 
              No technical knowledge required — we've written this in plain language so anyone can understand how things work.
            </p>
          </div>

          <Section icon={MessageSquare} title="What is Polyphonic?">
            <p>
              Polyphonic is a personal AI chat companion. You type messages, and an AI responds — similar to texting a very knowledgeable friend. 
              The AI can help you think through problems, write content, answer questions, brainstorm ideas, or just have a conversation.
            </p>
            <p className="mt-3">
              Unlike a search engine, Polyphonic remembers context within a conversation and can build on previous messages. 
              It also has a <strong>memory system</strong> that can remember things about you across different conversations, 
              so over time it gets better at understanding your preferences and needs.
            </p>
          </Section>

          <Section icon={Brain} title="How AI Responses Work">
            <p>
              When you send a message, it's sent to an AI model (think of it as the "brain" behind the responses). 
              The AI reads your message, considers the conversation history, and generates a response word by word. 
              That's why you see text appearing gradually — it's being written in real time.
            </p>
            <p className="mt-3">
              <strong>Important:</strong> AI can make mistakes. It can sound very confident while being completely wrong. 
              Always double-check important facts, especially about medical, legal, or financial topics. 
              Think of AI as a helpful assistant, not an authority.
            </p>
          </Section>

          <Section icon={Layers} title="What Are Models?">
            <p>
              A "model" is the specific AI brain that generates responses. Different models are made by different companies 
              (like OpenAI, Google, and Anthropic) and each has different strengths:
            </p>
            <ul className="mt-3 space-y-2 list-none">
              <li>• <strong>GPT-4.1, GPT-5</strong> — Made by OpenAI. Well-rounded, great for most tasks.</li>
              <li>• <strong>Gemini</strong> — Made by Google. Good with factual information and analysis.</li>
              <li>• <strong>Claude (Opus, Sonnet)</strong> — Made by Anthropic. Known for careful, nuanced responses.</li>
            </ul>
            <p className="mt-3">
              You can switch models anytime using the dropdown at the bottom of the chat. 
              If you're not sure which to pick, the default one works great for most conversations.
            </p>
          </Section>

          <Section icon={Key} title="Your API Key">
            <p>
              An API key is like a password that lets Polyphonic connect to AI services on your behalf. 
              Without one, you get a limited number of free messages per day (25).
            </p>
            <p className="mt-3">
              If you want unlimited messages, you can get your own API key from <strong>OpenRouter</strong> (a service that provides access to many AI models). 
              Here's how:
            </p>
            <ol className="mt-3 space-y-2 list-decimal list-inside">
              <li>Go to <strong>openrouter.ai</strong> and create a free account</li>
              <li>Add some credit (even $5 goes a long way — most messages cost less than 1 cent)</li>
              <li>Generate an API key in your OpenRouter dashboard</li>
              <li>Paste it into Polyphonic's Settings → Models & API tab</li>
            </ol>
            <p className="mt-3">
              <strong>Your key is encrypted</strong> before being stored. Polyphonic never sees or logs the full key after you save it.
            </p>
          </Section>

          <Section icon={Thermometer} title="What is Temperature?">
            <p>
              Temperature controls how "creative" or "random" the AI's responses are. Think of it like a dial:
            </p>
            <ul className="mt-3 space-y-2 list-none">
              <li>• <strong>Low (0.0–0.3)</strong> — More predictable, focused, and factual. Best for coding, math, or when you need precise answers.</li>
              <li>• <strong>Medium (0.4–0.7)</strong> — A good balance. This is the default and works well for most conversations.</li>
              <li>• <strong>High (0.8–1.0+)</strong> — More creative, varied, and surprising. Great for brainstorming, creative writing, or when you want unexpected ideas.</li>
            </ul>
            <p className="mt-3">
              If you're not sure, leave it at the default (0.7). You can adjust it in Settings → Models & API.
            </p>
          </Section>

          <Section icon={ScrollText} title="Custom Instructions">
            <p>
              Custom instructions are a message that gets sent to the AI with <em>every</em> conversation you have. 
              It's a way to tell the AI about yourself so you don't have to repeat things.
            </p>
            <p className="mt-3">For example, you could write:</p>
            <div
              className="mt-3 p-3 rounded-lg text-xs"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
            >
              "I'm a small business owner who runs a bakery. When I ask for help, keep things practical and simple. 
              I prefer short, direct answers unless I ask for detail."
            </div>
            <p className="mt-3">
              You can set this in Settings → General. The AI will always keep your instructions in mind when responding.
            </p>
          </Section>

          <Section icon={Brain} title="Memory">
            <p>
              Polyphonic has a memory system that automatically picks up on important things you mention — 
              like your preferences, goals, or personal details. These memories persist across conversations, 
              so the AI can reference them later without you repeating yourself.
            </p>
            <p className="mt-3">
              You can view, review, and delete individual memories in Settings → Memory. 
              If you turn memory off, the AI treats every conversation as a fresh start.
            </p>
          </Section>

          <Section icon={Sparkles} title="Personas">
            <p>
              Personas change the AI's conversational style. Polyphonic offers three options:
            </p>
            <ul className="mt-3 space-y-2 list-none">
              <li>• <strong>Neutral</strong> — Straightforward and helpful. No extra personality.</li>
              <li>• <strong>Resonant</strong> — Warmer and more empathetic. Good for personal conversations or when you want the AI to be more thoughtful in tone.</li>
              <li>• <strong>Polyphonic Experimental</strong> — A testing persona that may change. Used for trying out new AI behaviors.</li>
            </ul>
            <p className="mt-3">Choose your persona in Settings → General.</p>
          </Section>

          <Section icon={Shield} title="Privacy & Safety">
            <p>
              Here are important things to keep in mind:
            </p>
            <ul className="mt-3 space-y-3 list-none">
              <li>• <strong>Your conversations are private to your account</strong> — no one else can see them.</li>
              <li>• <strong>AI providers may process your messages</strong> — when you send a message, it's sent to the AI provider (OpenAI, Google, etc.) to generate a response. Review their privacy policies if this concerns you.</li>
              <li>• <strong>Don't share highly sensitive information</strong> — avoid entering passwords, social security numbers, financial account numbers, or other critical secrets into any AI chat.</li>
              <li>• <strong>Your API key is encrypted</strong> — it's stored securely and never exposed after saving.</li>
              <li>• <strong>You control your data</strong> — you can delete conversations, clear memories, and remove your API key at any time.</li>
            </ul>
          </Section>

          {/* FAQ */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <HelpCircle size={18} style={{ color: "rgba(255,255,255,0.7)" }} />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Frequently Asked Questions</h2>
            </div>
            <div className="pl-[52px]">
              <Accordion type="multiple" className="w-full">
                <AccordionItem value="cost" className="border-border/50">
                  <AccordionTrigger className="text-sm text-foreground hover:no-underline py-3">How much does it cost?</AccordionTrigger>
                  <AccordionContent className="text-sm text-foreground/80">
                    Polyphonic itself is free to use. You get 25 free messages per day. If you want more, you'll need an OpenRouter API key with credit loaded — 
                    most messages cost less than $0.01, so even $5 of credit lasts a very long time.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="wrong" className="border-border/50">
                  <AccordionTrigger className="text-sm text-foreground hover:no-underline py-3">What if the AI says something wrong?</AccordionTrigger>
                  <AccordionContent className="text-sm text-foreground/80">
                    It happens. AI models can "hallucinate" — meaning they generate plausible-sounding but incorrect information. 
                    Always verify important facts independently. You can also try regenerating the response or switching to a different model for a second opinion.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="model-diff" className="border-border/50">
                  <AccordionTrigger className="text-sm text-foreground hover:no-underline py-3">Does it matter which model I pick?</AccordionTrigger>
                  <AccordionContent className="text-sm text-foreground/80">
                    For everyday conversations, not really — any model will work well. Different models shine in different areas: 
                    some are better at creative writing, others at coding or analysis. If you're curious, try the same question with different models using the response comparison feature.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="data" className="border-border/50">
                  <AccordionTrigger className="text-sm text-foreground hover:no-underline py-3">Can I delete my data?</AccordionTrigger>
                  <AccordionContent className="text-sm text-foreground/80">
                    Yes. You can delete individual conversations from the sidebar, clear all memories from Settings → Memory, 
                    and remove your API key from Settings → Models & API. Your data is yours to control.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="variants" className="border-border/50">
                  <AccordionTrigger className="text-sm text-foreground hover:no-underline py-3">What does "Try Other Models" do?</AccordionTrigger>
                  <AccordionContent className="text-sm text-foreground/80">
                    When you hover over an AI response, you'll see a "Try Other Models" option. This regenerates the same response using a different AI model. 
                    All versions are saved and you can flip between them using the arrow buttons — great for comparing how different AIs handle the same question.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>

          <div className="text-center text-xs text-foreground/60 pb-8 pt-4">
            Still have questions? Just ask in the chat — the AI can help explain its own features too.
          </div>
        </div>
      </ScrollArea>
    </div>
    </PageTransition>
  );
};

export default Guide;
