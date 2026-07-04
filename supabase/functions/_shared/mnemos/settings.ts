/**
 * Per-user mnemos knobs from `memory_settings`.
 *
 * Cron edge functions fetch these to gate processing and tune behavior:
 * - mnemos_enabled: master switch — skip user entirely when false
 * - full_cognition_enabled: explicit opt-in for background cognition jobs
 * - decay_rate (0–100): multiplier on elapsed hours during decay (50 = 1.0×)
 * - dream_frequency: hourly | 6h | daily | weekly — gates consolidation cadence
 * - consolidation_enabled: skip consolidation when false (decay still runs)
 * - softening_enabled / softening_dry_run: audited lossy-compression controls
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic supabase client
type SupabaseClient = { from: (table: string) => any };

export type DreamFrequency = "hourly" | "6h" | "daily" | "weekly";

export interface MemorySettings {
  mnemos_enabled: boolean;
  full_cognition_enabled: boolean;
  decay_rate: number;
  dream_frequency: DreamFrequency;
  consolidation_enabled: boolean;
  softening_enabled: boolean;
  softening_dry_run: boolean;
}

export const DEFAULT_SETTINGS: MemorySettings = {
  mnemos_enabled: true,
  full_cognition_enabled: false,
  decay_rate: 50,
  dream_frequency: "daily",
  consolidation_enabled: true,
  softening_enabled: false,
  softening_dry_run: true,
};

export async function getMemorySettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<MemorySettings> {
  const { data } = await supabase
    .from("memory_settings")
    .select("mnemos_enabled, full_cognition_enabled, decay_rate, dream_frequency, consolidation_enabled, softening_enabled, softening_dry_run")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return DEFAULT_SETTINGS;
  return {
    mnemos_enabled: data.mnemos_enabled ?? DEFAULT_SETTINGS.mnemos_enabled,
    full_cognition_enabled: data.full_cognition_enabled ?? DEFAULT_SETTINGS.full_cognition_enabled,
    decay_rate: data.decay_rate ?? DEFAULT_SETTINGS.decay_rate,
    dream_frequency: (data.dream_frequency as DreamFrequency) ?? DEFAULT_SETTINGS.dream_frequency,
    consolidation_enabled: data.consolidation_enabled ?? DEFAULT_SETTINGS.consolidation_enabled,
    softening_enabled: data.softening_enabled ?? DEFAULT_SETTINGS.softening_enabled,
    softening_dry_run: data.softening_dry_run ?? DEFAULT_SETTINGS.softening_dry_run,
  };
}

/**
 * Convert the 0–100 decay slider to an elapsed-hours multiplier.
 * 0 → 0.2× (very slow), 50 → 1.0× (baseline), 100 → 3.0× (fast).
 */
export function decayMultiplierFromRate(rate: number): number {
  const clamped = Math.max(0, Math.min(100, rate));
  if (clamped <= 50) {
    // 0..50 → 0.2..1.0
    return 0.2 + (clamped / 50) * 0.8;
  }
  // 50..100 → 1.0..3.0
  return 1.0 + ((clamped - 50) / 50) * 2.0;
}

/**
 * Whether a consolidation cycle is due now given the user's chosen cadence
 * and the timestamp of the last successful cycle.
 */
export function isConsolidationDue(freq: DreamFrequency, lastRunIso: string | null): boolean {
  if (!lastRunIso) return true;
  const elapsedMs = Date.now() - new Date(lastRunIso).getTime();
  const hours = elapsedMs / 3_600_000;
  switch (freq) {
    case "hourly":
      return hours >= 1;
    case "6h":
      return hours >= 6;
    case "daily":
      return hours >= 24;
    case "weekly":
      return hours >= 24 * 7;
  }
}
