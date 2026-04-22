export interface StarterPrompt {
  pillar: 'Inner Mind' | 'Behavioral Patterns' | 'Cognitive Genome';
  label: string;
  prompt: string;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  // Inner Mind
  { pillar: 'Inner Mind', label: "Today's emotional weather", prompt: "Give me a one-paragraph read on my emotional state over the last 3 days, based on my mnemos emotional state recordings." },
  { pillar: 'Inner Mind', label: 'Top active beliefs', prompt: 'Show me my top 5 most-confident active beliefs as a list with their confidence scores.' },
  { pillar: 'Inner Mind', label: 'What I am avoiding', prompt: "Write a short narrative about what themes I've been quietly avoiding lately, based on the gap between what I bring up in messages versus what shows up in my engrams." },
  { pillar: 'Inner Mind', label: 'Recurring questions', prompt: 'List the open curiosity questions I keep coming back to but have not resolved.' },

  // Behavioral Patterns
  { pillar: 'Behavioral Patterns', label: 'Reflective vs reactive hours', prompt: 'Show me a 24-hour radial of when I tend to be most reflective (high salience thoughts) versus reactive across the past 30 days.' },
  { pillar: 'Behavioral Patterns', label: 'Looping topics', prompt: 'List the top 10 tags that appear most often across my engrams in the past 60 days.' },
  { pillar: 'Behavioral Patterns', label: 'Weekly memory rhythm', prompt: 'Show a heatmap of my engram counts by day-of-week and week, for the past 12 weeks.' },
  { pillar: 'Behavioral Patterns', label: 'Message volume timeline', prompt: 'Timeline of how many messages I sent per day over the past 30 days.' },

  // Cognitive Genome
  { pillar: 'Cognitive Genome', label: 'Belief confidence drift', prompt: 'Show me a comparison of my top 8 beliefs and their current confidence values.' },
  { pillar: 'Cognitive Genome', label: 'Memorable recent thoughts', prompt: 'Quote stream of my 8 most salient thoughts from the last 14 days.' },
  { pillar: 'Cognitive Genome', label: 'Engram emotional balance', prompt: 'Metric: average emotional valence across all my engrams from the last 30 days.' },
  { pillar: 'Cognitive Genome', label: 'Almost-asked questions', prompt: 'List the 8 highest-curiosity-score pending questions that I have not yet pulled into a chat.' },
];
