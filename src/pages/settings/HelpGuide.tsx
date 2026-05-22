import { Link } from 'react-router-dom';
import {
  BookOpenText,
  Bot,
  Brain,
  CircleUserRound,
  Database,
  Eye,
  FolderKanban,
  KeyRound,
  MessageSquare,
  NotebookPen,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { Section, Kbd } from '@/components/settings/Section';
import {
  SettingsPage,
  AgentDot,
} from '@/components/settings/SettingsPage';
import { useClock } from '@/components/settings/useClock';

const QUICK_START = [
  {
    label: 'Connect OpenRouter',
    body: 'Add your own model key so custom agents, model choice, attachments, and advanced runtime paths can work.',
    href: '/settings/models',
  },
  {
    label: 'Start with Luca',
    body: 'Use Luca as the home agent. Ask questions, make plans, build agents, and let the app learn what matters.',
    href: '/chat',
  },
  {
    label: 'Create agents',
    body: 'Ask Luca to draft an agent or open the manual editor for identity documents, model, voice, and instructions.',
    href: '/settings/agents',
  },
  {
    label: 'Read the notebook',
    body: 'Journal is the calm, chronological view of inner-life activity, memories, thoughts, reflections, and beliefs.',
    href: '/journal',
  },
];

const FEATURE_MAP = [
  {
    icon: MessageSquare,
    title: 'Chat',
    href: '/chat',
    desc: 'The main conversation surface. Use the agent selector to choose who answers, and the Observer alcove when you want a side read without changing agents.',
  },
  {
    icon: CircleUserRound,
    title: 'Profile',
    href: '/profile',
    desc: 'The structured psychological portrait built from imports and memories. Use it to inspect how Polyphonic understands your communication, values, relationships, cognition, and growth edges.',
  },
  {
    icon: Bot,
    title: 'Agents',
    href: '/settings/agents',
    desc: 'The place to review and edit agent identity, model, prompt, voice, tools, and identity documents. Luca can also create agents through Forge proposals.',
  },
  {
    icon: NotebookPen,
    title: 'Journal',
    href: '/journal',
    desc: 'The primary reader surface for each agent’s ongoing notebook: journal entries, thoughts, dreams, reflections, insights, beliefs, and notable activity.',
  },
  {
    icon: Database,
    title: 'Memory',
    href: '/memory',
    desc: 'A deeper browser for memories, engrams, beliefs, imports, and memory settings. Use this when you need to inspect the substrate directly.',
  },
  {
    icon: Brain,
    title: 'Mind',
    href: '/mind',
    desc: 'The advanced diagnostic view for inner-life streams. It is useful for debugging and inspection; Journal is the simpler day-to-day view.',
  },
  {
    icon: FolderKanban,
    title: 'Projects',
    href: '/projects',
    desc: 'Organized workspaces for threads and context. Use projects when a conversation belongs to an ongoing body of work.',
  },
];

const GLOSSARY = [
  ['Luca', 'The resident home agent. Luca can chat, help you work, and create or revise custom agents through the Forge flow.'],
  ['Custom agent', 'A user-created agent with its own identity documents, model, journal, memory, and mind substrate.'],
  ['Observer', 'A sidecar presence in the chat alcove. Observer watches, summarizes, and answers questions about the conversation, but is not an autonomous agent.'],
  ['Forge', 'The chat-native agent builder. Luca drafts a full agent blueprint, you approve it, and the agent appears in your agent list.'],
  ['Psychological profile', 'The structured user portrait generated from imported conversation evidence and memories. It is the readable map of communication style, emotional patterns, values, relationships, cognition, growth edges, and shadow patterns.'],
  ['User model', 'An agent-specific identity document describing how that agent should understand and care for the user. It should stay aligned with the profile, but it is not the same thing as the full profile record.'],
  ['Substrate', 'The continuity system behind an agent: identity documents, memories, journal, engrams, beliefs, emotional state, and activity.'],
  ['Engram', 'A memory trace used by the Mnemos memory system. Engrams are lower-level than the user-facing notebook.'],
];

const TROUBLESHOOTING = [
  {
    problem: 'A custom agent says it needs an API key.',
    fix: 'Open Models and connect OpenRouter. Custom agents are BYOK, while Luca may still have a platform/free route.',
  },
  {
    problem: 'An agent seems to be using the wrong identity.',
    fix: 'Check the active agent selector in Chat, then open Agents and confirm that agent’s identity documents and model are correct.',
  },
  {
    problem: 'Journal or Memory looks empty.',
    fix: 'Switch to the intended active agent. Each agent has its own notebook and memory substrate, so Luca and custom agents will not show the same records.',
  },
  {
    problem: 'The profile feels incomplete or outdated.',
    fix: 'Open Profile or Import & export and re-run profiling from the relevant import. The profile is evidence-based, so it improves when the underlying conversation record is richer and cleaner.',
  },
  {
    problem: 'Observer appears in a place that feels like agent autonomy.',
    fix: 'Observer should only live in the alcove and observer notes. If it appears as an autonomous journal/mind author, that is a bug to report.',
  },
];

function GuideLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link className="guide-link" to={href}>
      {children}
    </Link>
  );
}

export default function HelpGuide() {
  const time = useClock();

  return (
    <SettingsPage
      folio={{
        left: (
          <>
            <span>
              <AgentDot /> polyphonic
            </span>
            <span>
              settings · <span className="v">guide</span>
            </span>
          </>
        ),
        right: (
          <>
            <span>help center</span>
            <span>{time}</span>
          </>
        ),
      }}
    >
      <div className="set-head">
        <div className="set-head-eye">
          <span className="num">§ 10 / 10</span>
          <span>·</span>
          <span className="v">Orientation</span>
        </div>
        <h1 className="set-head-title">Guide</h1>
        <p className="set-head-sub">
          A practical map of Polyphonic: how to set it up, what each surface is
          for, and how Luca, custom agents, memory, Journal, Mind, and Observer
          fit together.
        </p>
      </div>

      <div className="set-body guide-body">
        <Section
          number="01"
          name="Start here"
          title="First setup"
          desc="The shortest path from a fresh account to a working custom-agent system."
        >
          <div className="guide-step-grid">
            {QUICK_START.map((step, index) => (
              <GuideLink key={step.label} href={step.href}>
                <span className="guide-step-num">{String(index + 1).padStart(2, '0')}</span>
                <span className="guide-step-copy">
                  <span className="guide-step-title">{step.label}</span>
                  <span className="guide-step-desc">{step.body}</span>
                </span>
              </GuideLink>
            ))}
          </div>
        </Section>

        <Section
          number="02"
          name="Model key"
          title="Set up OpenRouter"
          desc="Polyphonic stores one encrypted OpenRouter key. That key authorizes model calls for custom agents and advanced model paths."
        >
          <div className="guide-callout">
            <KeyRound size={18} strokeWidth={1.7} aria-hidden="true" />
            <div>
              <div className="guide-callout-title">Use Settings → Models</div>
              <p>
                Click <span className="guide-inline">Connect with OpenRouter</span>
                {' '}or paste an <span className="guide-inline">sk-or-v1</span>
                {' '}key. Polyphonic stores only the encrypted key and shows a
                short preview so you can confirm one is connected.
              </p>
            </div>
            <GuideLink href="/settings/models">Open Models</GuideLink>
          </div>
          <div className="guide-note-row">
            <div>
              <span>Why it matters</span>
              <p>
                Luca may have a platform route, but custom agents are designed
                to run on your key so their model, tools, and continuity are
                explicit and under your control.
              </p>
            </div>
            <div>
              <span>When it is missing</span>
              <p>
                Custom-agent chat will fail clearly instead of silently becoming
                Luca. That protects identity separation.
              </p>
            </div>
          </div>
        </Section>

        <Section
          number="03"
          name="Surfaces"
          title="What each area does"
          desc="The app is easiest to understand as a small set of reader, work, and diagnostic surfaces."
        >
          <div className="guide-feature-grid">
            {FEATURE_MAP.map(({ icon: Icon, title, href, desc }) => (
              <GuideLink key={title} href={href}>
                <span className="guide-feature-icon"><Icon size={17} strokeWidth={1.65} /></span>
                <span className="guide-feature-copy">
                  <span className="guide-feature-title">{title}</span>
                  <span className="guide-feature-desc">{desc}</span>
                </span>
              </GuideLink>
            ))}
          </div>
        </Section>

        <Section
          number="04"
          name="Profile"
          title="How the psychological profile works"
          guideId="help-profile-section"
          desc="The profile is the auditable portrait Polyphonic builds from imported conversations and memory evidence. It is about the user, not about any one agent."
        >
          <div className="guide-note-row three">
            <div>
              <span>Source</span>
              <p>
                Imports can run a deep analysis pass that reads real
                conversation evidence and stores a structured psychological
                profile for your account.
              </p>
            </div>
            <div>
              <span>Shape</span>
              <p>
                The profile organizes identity narrative, personality
                dimensions, communication patterns, emotional landscape, values,
                relationships, cognition, growth edges, and shadow patterns.
              </p>
            </div>
            <div>
              <span>Use</span>
              <p>
                Profile chat can answer questions from the structured profile,
                raw analysis passes, and searchable memories with citations.
              </p>
            </div>
          </div>
          <div className="guide-callout muted">
            <CircleUserRound size={18} strokeWidth={1.7} aria-hidden="true" />
            <p>
              Luca and custom agents should understand you through their own
              user-model document, retrieved memories, and agent-specific
              continuity records. The Profile page is the user-readable source
              for auditing that model of you; it does not replace an agent’s
              soul or identity, and it should not make every agent sound the
              same.
            </p>
          </div>
          <div className="guide-action-row">
            <GuideLink href="/profile">Open Profile</GuideLink>
            <GuideLink href="/import">Import conversations</GuideLink>
            <GuideLink href="/settings/portability">Import & export</GuideLink>
          </div>
        </Section>

        <Section
          number="05"
          name="Agents"
          title="Luca, custom agents, and Observer"
          guideId="help-agents-section"
          desc="There are full agents, and there is the Observer sidecar. Keeping that distinction clear keeps identity and memory clean."
        >
          <div className="guide-rule-list">
            <div>
              <Bot size={17} strokeWidth={1.65} aria-hidden="true" />
              <span>Luca is the resident home agent and can help build or revise other agents.</span>
            </div>
            <div>
              <BookOpenText size={17} strokeWidth={1.65} aria-hidden="true" />
              <span>Custom agents get their own identity documents, prompt, model, Journal, Memory, and Mind records.</span>
            </div>
            <div>
              <Eye size={17} strokeWidth={1.65} aria-hidden="true" />
              <span>Observer watches and answers from the alcove. It does not journal, dream, or run autonomous substrate loops.</span>
            </div>
          </div>
          <p className="guide-copy">
            To make an agent, ask Luca in any chat. Luca should create a Forge
            proposal card rather than writing a raw text block. Nothing is saved
            until you approve the card.
          </p>
        </Section>

        <Section
          number="06"
          name="Memory"
          title="Journal, Memory, and Mind"
          guideId="help-memory-section"
          desc="These three surfaces are related, but they serve different levels of detail."
        >
          <div className="guide-note-row three">
            <div>
              <span>Journal</span>
              <p>
                The readable notebook. Start here when you want to understand
                what an agent has been thinking, noticing, remembering, or doing.
              </p>
            </div>
            <div>
              <span>Memory</span>
              <p>
                The substrate browser. Use it to inspect memories, engrams,
                beliefs, imports, and memory settings.
              </p>
            </div>
            <div>
              <span>Mind</span>
              <p>
                The diagnostic room. It keeps individual streams visible for
                debugging and deeper inspection.
              </p>
            </div>
          </div>
        </Section>

        <Section
          number="07"
          name="Control"
          title="Privacy, import, and reset"
          desc="The important user controls are grouped around data intake, stored memory, and account-level settings."
        >
          <div className="guide-action-row">
            <GuideLink href="/import">Import conversations</GuideLink>
            <GuideLink href="/memory">Review memory</GuideLink>
            <GuideLink href="/settings/account">Account controls</GuideLink>
            <GuideLink href="/privacy">Privacy policy</GuideLink>
          </div>
          <div className="guide-callout muted">
            <ShieldCheck size={18} strokeWidth={1.7} aria-hidden="true" />
            <p>
              Imports and cognition reset controls are powerful. Use Import &
              export for bringing conversation data in; use Memory and Account
              controls when you need to inspect or reset stored state.
            </p>
          </div>
        </Section>

        <Section
          number="08"
          name="Keyboard"
          title="Common controls"
          desc="A few controls are worth learning because they make the app feel much faster."
        >
          <div className="guide-shortcuts">
            <div><Kbd>⌘K</Kbd><span>Open command palette</span></div>
            <div><Kbd>⌘\</Kbd><span>Collapse or expand the left panel</span></div>
            <div><Kbd>↵</Kbd><span>Activate the selected command or search result</span></div>
          </div>
        </Section>

        <Section
          number="09"
          name="Reference"
          title="Terms you will see"
          desc="Plain definitions for the parts of the system that can otherwise sound more mysterious than they are."
        >
          <div className="guide-glossary">
            {GLOSSARY.map(([term, definition]) => (
              <div key={term}>
                <span>{term}</span>
                <p>{definition}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section
          number="10"
          name="Troubleshooting"
          title="When something feels off"
          desc="The first checks to run before assuming the system has lost the plot."
        >
          <div className="guide-troubleshooting">
            {TROUBLESHOOTING.map((item) => (
              <div key={item.problem}>
                <Wrench size={16} strokeWidth={1.65} aria-hidden="true" />
                <div>
                  <span>{item.problem}</span>
                  <p>{item.fix}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </SettingsPage>
  );
}
