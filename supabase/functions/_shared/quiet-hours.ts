// Phase L10 (gap fix) — shared quiet-hours helper.
//
// Both `luca-initiate` (delivery channel decisions) and
// `proactive-engagement` (surface gating) need to know whether the user is in
// their quiet window. Keeping the rule in one place avoids the two code
// paths drifting.

export interface QuietHoursConfig {
  start: number | null;
  end: number | null;
  tz: string;
}

const DEFAULT_QUIET_TZ = "UTC";

export const QUIET_HOURS_PROFILE_FIELDS =
  "quiet_hours_start, quiet_hours_end, quiet_hours_tz";

/**
 * Treats start/end as integer hours [0..23] in the user's tz.
 * If start or end is null, returns false (never quiet).
 * Handles wrap-around (e.g. 22 → 7).
 */
export function isInQuietHours(config: QuietHoursConfig): boolean {
  const { start, end } = config;
  if (start === null || end === null) return false;
  if (start === end) return false;

  const tz = config.tz || DEFAULT_QUIET_TZ;
  let hour: number;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    });
    hour = parseInt(fmt.format(new Date()), 10);
  } catch {
    return false;
  }
  if (Number.isNaN(hour)) return false;

  if (start < end) return hour >= start && hour < end;
  // wrap (e.g. 22 → 7)
  return hour >= start || hour < end;
}

export interface QuietHoursLookup {
  isQuiet: boolean;
  config: QuietHoursConfig;
}

export async function loadQuietHours(
  supabase: any,
  userId: string,
): Promise<QuietHoursLookup> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select(QUIET_HOURS_PROFILE_FIELDS)
      .eq("user_id", userId)
      .maybeSingle();

    const config: QuietHoursConfig = {
      start: data?.quiet_hours_start ?? null,
      end: data?.quiet_hours_end ?? null,
      tz: data?.quiet_hours_tz || DEFAULT_QUIET_TZ,
    };
    return { config, isQuiet: isInQuietHours(config) };
  } catch (err) {
    console.warn("[quiet-hours] lookup failed:", err);
    return { config: { start: null, end: null, tz: DEFAULT_QUIET_TZ }, isQuiet: false };
  }
}
