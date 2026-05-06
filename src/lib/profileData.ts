export type ProfileRecord = Record<string, unknown>;

const LABEL_KEYS = [
  'label',
  'value',
  'phrase',
  'claim',
  'name',
  'topic',
  'type',
  'direction',
  'role',
  'primary',
  'prose',
  'description',
  'evidence',
] as const;

const BODY_KEYS = [
  'claim',
  'description',
  'dynamic',
  'evidence',
  'prose',
  'value',
  'phrase',
  'label',
] as const;

export function isProfileRecord(value: unknown): value is ProfileRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asProfileRecord(value: unknown): ProfileRecord {
  return isProfileRecord(value) ? value : {};
}

export function asProfileArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

export function profileNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function firstTextField(record: ProfileRecord, keys: readonly string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return '';
}

export function profileLabel(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => profileLabel(item)).filter(Boolean).join(', ') || fallback;
  }
  if (!isProfileRecord(value)) return fallback;

  const direct = firstTextField(value, LABEL_KEYS);
  if (direct) return direct;

  const nested = Object.values(value)
    .map((item) => profileLabel(item))
    .filter(Boolean);
  return nested[0] ?? fallback;
}

export function profileText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => profileText(item)).filter(Boolean).join('; ') || fallback;
  }
  if (!isProfileRecord(value)) return fallback;

  const body = firstTextField(value, BODY_KEYS);
  const evidence = firstTextField(value, ['evidence', 'source']);
  if (body && evidence && body !== evidence && !body.includes(evidence)) {
    return `${body} Evidence: ${evidence}`;
  }
  if (body) return body;

  const nested = Object.values(value)
    .map((item) => profileText(item))
    .filter(Boolean);
  return nested.join('; ') || fallback;
}

export function profileStringList(value: unknown): string[] {
  return asProfileArray(value)
    .map((item) => profileText(item))
    .filter((item): item is string => Boolean(item));
}

export function profileTagItems(value: unknown): Array<{ label: string; count?: number }> {
  return asProfileArray(value)
    .map((item) => {
      const label = profileLabel(item);
      if (!label) return null;
      const record = asProfileRecord(item);
      const count =
        profileNumber(record.count, NaN)
        || profileNumber(record.occurrences, NaN)
        || profileNumber(record.frequency, NaN);
      return Number.isFinite(count) ? { label, count } : { label };
    })
    .filter((item): item is { label: string; count: number } | { label: string; count?: undefined } => item !== null);
}

export type NormalizedRankedValue = {
  value: string;
  rank?: number;
  evidence?: string;
  stated_score?: number;
  revealed_score?: number;
  divergence_tag?: string;
  divergence_narrative?: string;
};

export function profileRankedValues(value: unknown): NormalizedRankedValue[] {
  return asProfileArray(value)
    .map((item, index) => {
      const record = asProfileRecord(item);
      const label = profileLabel(item);
      if (!label) return null;
      const rank = profileNumber(record.rank, index + 1);
      const evidence =
        profileText(record.evidence)
        || profileText(record.divergence_narrative)
        || profileText(record.description);
      return {
        value: label,
        rank,
        evidence: evidence || undefined,
        stated_score: isProfileRecord(item) ? profileNumber(item.stated_score, NaN) : undefined,
        revealed_score: isProfileRecord(item) ? profileNumber(item.revealed_score, NaN) : undefined,
        divergence_tag: isProfileRecord(item) ? profileText(item.divergence_tag) || undefined : undefined,
        divergence_narrative: isProfileRecord(item) ? profileText(item.divergence_narrative) || undefined : undefined,
      };
    })
    .filter((item: NormalizedRankedValue | null): item is NormalizedRankedValue => item !== null);
}

export type NormalizedRelationship = {
  role: string;
  dynamic: string;
};

export function profileRelationships(value: unknown): NormalizedRelationship[] {
  return asProfileArray(value)
    .map((item, index) => {
      if (typeof item === 'string') {
        return { role: `Relationship ${index + 1}`, dynamic: item };
      }
      const record = asProfileRecord(item);
      const role = profileText(record.role) || profileText(record.name) || profileText(record.label);
      const dynamic =
        profileText(record.dynamic)
        || profileText(record.description)
        || profileText(record.evidence)
        || profileText(record.dynamic_type)
        || profileText(item);
      if (!role && !dynamic) return null;
      return {
        role: role || `Relationship ${index + 1}`,
        dynamic: dynamic || 'Signal present.',
      };
    })
    .filter((item): item is NormalizedRelationship => item !== null);
}

export function profileNumberRecord(value: unknown): Record<string, number> {
  const record = asProfileRecord(value);
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, raw]) => [key, profileNumber(raw, NaN)] as const)
      .filter(([, numeric]) => Number.isFinite(numeric)),
  );
}
