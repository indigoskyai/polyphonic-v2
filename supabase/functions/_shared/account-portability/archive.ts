export const ACCOUNT_EXPORT_FORMAT = "polyphonic-account-export";
export const ACCOUNT_EXPORT_VERSION = 1;
export const ACCOUNT_PORTABILITY_BUCKET = "account-portability";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonRecord = Record<string, JsonValue>;

export interface PortableTableConfig {
  name: string;
  idColumn?: string;
  userColumn?: string;
  agentColumn?: string;
  singleton?: boolean;
  readOnly?: boolean;
  onConflict?: string;
  redactColumns?: string[];
  disableOnImport?: string[];
  remapColumns?: Record<string, string>;
  arrayRemapColumns?: Record<string, string>;
  jsonColumns?: string[];
}

export interface PortableAsset {
  bucket: string;
  path: string;
  content_type?: string | null;
  size?: number | null;
  base64?: string;
  missing?: boolean;
  error?: string;
}

export interface AccountExportPayload {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  version: typeof ACCOUNT_EXPORT_VERSION;
  export_id: string;
  exported_at: string;
  source_user_id: string;
  manifest: {
    app: "polyphonic";
    tables: Record<string, number>;
    assets: { total: number; missing: number };
    excluded: string[];
  };
  tables: Record<string, JsonRecord[]>;
  assets: PortableAsset[];
  warnings: string[];
}

export interface EncryptedArchive {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  version: typeof ACCOUNT_EXPORT_VERSION;
  encryption: {
    alg: "AES-GCM";
    kdf: "PBKDF2-SHA256";
    iterations: number;
    salt: string;
    iv: string;
  };
  payload: string;
}

export interface ArchiveEncryptionMetadata {
  alg: "AES-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
}

export interface ArchiveCryptoContext {
  key: CryptoKey;
  encryption: ArchiveEncryptionMetadata;
}

export interface EncryptedArchiveChunk {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  version: typeof ACCOUNT_EXPORT_VERSION;
  mode: "chunk";
  table: string;
  index: number;
  row_count: number;
  encryption: {
    alg: "AES-GCM";
    iv: string;
  };
  payload: string;
}

export interface AccountExportChunkRef {
  table: string;
  index: number;
  row_count: number;
  storage_bucket: string;
  storage_path: string;
  sha256: string;
}

export interface ChunkedEncryptedArchive {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  version: typeof ACCOUNT_EXPORT_VERSION;
  mode: "chunked";
  encryption: ArchiveEncryptionMetadata;
  export_id: string;
  exported_at: string;
  source_user_id: string;
  manifest: AccountExportPayload["manifest"];
  chunks: AccountExportChunkRef[];
  assets: PortableAsset[];
  warnings: string[];
}

export type PortableArchiveFile = EncryptedArchive | ChunkedEncryptedArchive;

export interface ImportIdMaps {
  ids: Record<string, Record<string, string>>;
  agents: Record<string, string>;
  assets: Record<string, { bucket: string; path: string; signedUrl?: string }>;
}

const RESIDENT_AGENT_IDS = new Set(["luca", "anima", "vektor", "observer", "guardian"]);
const COMMON_REDACT_COLUMNS = new Set([
  "encrypted_key",
  "device_token_hash",
  "push_subscription",
  "wallet_address",
  "nonce",
  "code",
  "last_four",
]);

export const EXCLUDED_PORTABILITY_TABLES = [
  "user_api_keys",
  "agent_secrets",
  "openclaw_devices",
  "openclaw_pairing_codes",
  "openclaw_relay_sessions",
  "openclaw_jobs",
  "token_gate_nonces",
  "token_gate_verifications",
  "token_gate_email_allowlist",
  "email_send_log",
  "email_send_state",
  "suppressed_emails",
  "email_unsubscribe_tokens",
  "daily_usage",
  "idempotency_keys",
  "client_error_log",
] as const;

export const PORTABLE_TABLES: PortableTableConfig[] = [
  { name: "profiles", idColumn: "id", userColumn: "user_id", singleton: true, onConflict: "user_id", redactColumns: ["push_subscription", "last_seen_activity_at"] },
  { name: "user_settings", idColumn: "id", userColumn: "user_id", singleton: true, onConflict: "user_id" },
  { name: "memory_settings", userColumn: "user_id", singleton: true, onConflict: "user_id" },
  { name: "agent_configs", idColumn: "id", userColumn: "user_id", onConflict: "user_id,id", redactColumns: ["preferred_device_id", "openclaw_agent_id", "elevenlabs_agent_id"] },
  { name: "openclaw_agents", idColumn: "id", userColumn: "user_id", remapColumns: { agent_config_id: "agent_configs" } },
  { name: "projects", idColumn: "id", userColumn: "user_id" },
  { name: "conversations", idColumn: "id", userColumn: "user_id", readOnly: true },
  { name: "threads", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", remapColumns: { project_id: "projects" }, arrayRemapColumns: { participating_agent_ids: "agent" } },
  { name: "messages", idColumn: "id", userColumn: "user_id", remapColumns: { thread_id: "threads" }, jsonColumns: ["metadata", "attachments"] },
  { name: "artifacts", idColumn: "id", userColumn: "user_id", remapColumns: { thread_id: "threads", source_message_id: "messages", parent_artifact_id: "artifacts" } },
  { name: "agent_consultations", idColumn: "id", userColumn: "user_id", remapColumns: { parent_thread_id: "threads", parent_message_id: "messages" } },
  { name: "memories", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", jsonColumns: ["provenance"] },
  { name: "engrams", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", jsonColumns: ["source_context"] },
  { name: "engram_archive", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", jsonColumns: ["source_context"] },
  { name: "connections", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", remapColumns: { source_id: "engrams", target_id: "engrams" } },
  { name: "beliefs", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", arrayRemapColumns: { supporting_engram_ids: "engrams", contradicting_engram_ids: "engrams" }, jsonColumns: ["evidence", "revision_history"] },
  { name: "mnemos_emotional_state", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id" },
  { name: "mnemos_digests", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id" },
  { name: "hypomnema_entry", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", remapColumns: { thread_id: "threads", source_message_id: "messages", graduated_to_engram_id: "engrams", superseded_by: "hypomnema_entry" }, jsonColumns: ["meta", "revisions"] },
  { name: "journal_entries", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", remapColumns: { source_conversation_id: "threads" }, jsonColumns: ["source_context"] },
  { name: "thought_stream", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id" },
  { name: "thought_initiations", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id" },
  { name: "activity_events", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", jsonColumns: ["metadata"] },
  { name: "memory_events", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id" },
  { name: "memory_candidates", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", jsonColumns: ["source"] },
  { name: "cognitive_state", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", singleton: true, onConflict: "user_id,agent_id", jsonColumns: ["beliefs", "emotions", "modulators"] },
  { name: "emotional_state", userColumn: "user_id", agentColumn: "agent_id", singleton: true, onConflict: "user_id,agent_id" },
  { name: "emotional_history", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", jsonColumns: ["state"] },
  { name: "daily_logs", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", jsonColumns: ["content"] },
  { name: "observer_notes", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", remapColumns: { thread_id: "threads" }, jsonColumns: ["metadata"] },
  { name: "observer_logs", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", jsonColumns: ["observations"] },
  { name: "observer_chat_messages", idColumn: "id", userColumn: "user_id", remapColumns: { thread_id: "threads" } },
  { name: "curiosity_questions", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id" },
  { name: "agent_identity", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", singleton: true, onConflict: "user_id,agent_id,doc_type" },
  { name: "agent_identity_patches", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", remapColumns: { source_thread_id: "threads" }, arrayRemapColumns: { source_message_ids: "messages" } },
  { name: "pending_revisions", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", remapColumns: { thread_id: "threads", source_message_id: "messages" } },
  { name: "agent_skills", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", remapColumns: { source_thread_id: "threads" } },
  { name: "agent_skill_denials", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", remapColumns: { source_skill_id: "agent_skills" } },
  { name: "psychological_profile", idColumn: "id", userColumn: "user_id", singleton: true, onConflict: "user_id", jsonColumns: ["personality_dimensions", "communication_patterns", "emotional_landscape", "relational_dynamics", "values_hierarchy", "shadow_patterns", "cognitive_tendencies", "growth_edges", "raw_analysis"] },
  { name: "profile_daily_pulse", idColumn: "id", userColumn: "user_id", jsonColumns: ["payload"] },
  { name: "profile_chats", idColumn: "id", userColumn: "user_id" },
  { name: "profile_chat_messages", idColumn: "id", userColumn: "user_id", remapColumns: { chat_id: "profile_chats" }, jsonColumns: ["citations"] },
  { name: "scheduled_tasks", idColumn: "id", userColumn: "user_id", agentColumn: "agent_id", remapColumns: { target_thread_id: "threads" }, disableOnImport: ["enabled"] },
  { name: "dashboard_widgets", idColumn: "id", userColumn: "user_id", jsonColumns: ["spec"] },
  { name: "checkpoints", idColumn: "id", userColumn: "user_id" },
  { name: "crisis_events", idColumn: "id", userColumn: "user_id", remapColumns: { thread_id: "threads", message_id: "messages" } },
];

export const PORTABLE_TABLE_BY_NAME = new Map(PORTABLE_TABLES.map((table) => [table.name, table]));

export function tableCounts(tables: Record<string, JsonRecord[]>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of PORTABLE_TABLES) counts[table.name] = tables[table.name]?.length ?? 0;
  return counts;
}

export function assertArchivePayload(value: unknown): AccountExportPayload {
  if (!isRecord(value)) throw new Error("Archive payload is not an object");
  if (value.format !== ACCOUNT_EXPORT_FORMAT) throw new Error("Unsupported archive format");
  if (value.version !== ACCOUNT_EXPORT_VERSION) throw new Error("Unsupported archive version");
  if (!isRecord(value.tables)) throw new Error("Archive is missing table data");
  return value as unknown as AccountExportPayload;
}

export function validateEncryptedArchive(value: unknown): EncryptedArchive {
  if (!isRecord(value)) throw new Error("Export file is not valid JSON");
  if (value.format !== ACCOUNT_EXPORT_FORMAT) throw new Error("Not a Polyphonic export");
  if (value.version !== ACCOUNT_EXPORT_VERSION) throw new Error("Unsupported export version");
  if (!isRecord(value.encryption)) throw new Error("Export is missing encryption metadata");
  if (typeof value.payload !== "string" || value.payload.length === 0) throw new Error("Export has no encrypted payload");
  return value as unknown as EncryptedArchive;
}

export function validateChunkedArchive(value: unknown): ChunkedEncryptedArchive {
  if (!isRecord(value)) throw new Error("Export file is not valid JSON");
  if (value.format !== ACCOUNT_EXPORT_FORMAT) throw new Error("Not a Polyphonic export");
  if (value.version !== ACCOUNT_EXPORT_VERSION) throw new Error("Unsupported export version");
  if (value.mode !== "chunked") throw new Error("Export is not a chunked Polyphonic export");
  if (!isRecord(value.encryption)) throw new Error("Export is missing encryption metadata");
  if (!Array.isArray(value.chunks)) throw new Error("Export is missing chunk references");
  if (!isRecord(value.manifest)) throw new Error("Export is missing a manifest");
  return value as unknown as ChunkedEncryptedArchive;
}

export function parsePortableArchiveText(text: string): PortableArchiveFile {
  const parsed = JSON.parse(text);
  if (isRecord(parsed) && parsed.mode === "chunked") return validateChunkedArchive(parsed);
  return validateEncryptedArchive(parsed);
}

export function redactPortableRow(config: PortableTableConfig, row: JsonRecord): JsonRecord {
  const out: JsonRecord = {};
  const redactions = new Set([...(config.redactColumns || []), ...COMMON_REDACT_COLUMNS]);
  for (const [key, value] of Object.entries(row)) {
    if (redactions.has(key)) continue;
    out[key] = sanitizeJson(value);
  }
  return out;
}

export function buildManifest(tables: Record<string, JsonRecord[]>, assets: PortableAsset[], warnings: string[]) {
  return {
    app: "polyphonic" as const,
    tables: tableCounts(tables),
    assets: {
      total: assets.length,
      missing: assets.filter((asset) => asset.missing).length,
    },
    excluded: [...EXCLUDED_PORTABILITY_TABLES],
    warnings,
  };
}

export async function encryptPayload(payload: AccountExportPayload, passphrase: string): Promise<EncryptedArchive> {
  const { key, salt, iterations } = await deriveNewArchiveKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    encryption: {
      alg: "AES-GCM",
      kdf: "PBKDF2-SHA256",
      iterations,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
    },
    payload: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function createArchiveCryptoContext(passphrase: string): Promise<ArchiveCryptoContext> {
  const { key, salt, iterations } = await deriveNewArchiveKey(passphrase);
  return {
    key,
    encryption: {
      alg: "AES-GCM",
      kdf: "PBKDF2-SHA256",
      iterations,
      salt: bytesToBase64(salt),
    },
  };
}

export async function createArchiveDecryptContext(
  passphrase: string,
  encryption: ArchiveEncryptionMetadata,
): Promise<ArchiveCryptoContext> {
  const salt = base64ToBytes(encryption.salt);
  return {
    key: await deriveExistingArchiveKey(passphrase, salt, encryption.iterations),
    encryption,
  };
}

export async function encryptArchiveRowsChunk(
  table: string,
  index: number,
  rows: JsonRecord[],
  context: ArchiveCryptoContext,
): Promise<EncryptedArchiveChunk> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify({ table, rows }));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, context.key, encoded);
  return {
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    mode: "chunk",
    table,
    index,
    row_count: rows.length,
    encryption: {
      alg: "AES-GCM",
      iv: bytesToBase64(iv),
    },
    payload: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptArchiveRowsChunk(
  chunk: EncryptedArchiveChunk,
  context: ArchiveCryptoContext,
): Promise<JsonRecord[]> {
  if (chunk.format !== ACCOUNT_EXPORT_FORMAT || chunk.version !== ACCOUNT_EXPORT_VERSION || chunk.mode !== "chunk") {
    throw new Error("Invalid export chunk");
  }
  const iv = base64ToBytes(chunk.encryption.iv);
  const ciphertext = base64ToBytes(chunk.payload);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, context.key, ciphertext as BufferSource);
  const parsed = JSON.parse(new TextDecoder().decode(decrypted));
  if (!isRecord(parsed) || parsed.table !== chunk.table || !Array.isArray(parsed.rows)) {
    throw new Error("Export chunk payload is invalid");
  }
  return parsed.rows as JsonRecord[];
}

export async function decryptArchive(archive: EncryptedArchive, passphrase: string): Promise<AccountExportPayload> {
  const salt = base64ToBytes(archive.encryption.salt);
  const iv = base64ToBytes(archive.encryption.iv);
  const key = await deriveExistingArchiveKey(passphrase, salt, archive.encryption.iterations);
  const ciphertext = base64ToBytes(archive.payload);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, ciphertext as BufferSource);
  const parsed = JSON.parse(new TextDecoder().decode(decrypted));
  return assertArchivePayload(parsed);
}

export async function sha256Text(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(hash));
}

export function parseArchiveText(text: string): EncryptedArchive {
  return validateEncryptedArchive(JSON.parse(text));
}

export function createIdMaps(payload: AccountExportPayload, existingAgentIds: Set<string>): ImportIdMaps {
  const ids: Record<string, Record<string, string>> = {};
  const agents: Record<string, string> = {};

  const agentRows = payload.tables.agent_configs || [];
  for (const row of agentRows) {
    const sourceId = stringValue(row.id);
    if (!sourceId) continue;
    agents[sourceId] = mapAgentId(sourceId, existingAgentIds, payload.export_id);
  }

  for (const table of PORTABLE_TABLES) {
    ids[table.name] = {};
    for (const row of payload.tables[table.name] || []) {
      const sourceId = sourceRowId(table, row);
      if (!sourceId) continue;
      if (table.name === "agent_configs") {
        ids[table.name][sourceId] = agents[sourceId] || sourceId;
      } else if (table.idColumn) {
        ids[table.name][sourceId] = crypto.randomUUID();
      }
    }
  }

  return { ids, agents, assets: {} };
}

export function transformRowForImport(
  config: PortableTableConfig,
  row: JsonRecord,
  targetUserId: string,
  maps: ImportIdMaps,
  importJobId: string,
  exportId: string,
): JsonRecord {
  const out: JsonRecord = { ...row };
  const sourceId = sourceRowId(config, row);
  const mappedId = sourceId ? maps.ids[config.name]?.[sourceId] : undefined;

  if (config.idColumn && mappedId) {
    out[config.idColumn] = mappedId;
  }
  if (config.userColumn) out[config.userColumn] = targetUserId;
  if (config.agentColumn) {
    out[config.agentColumn] = mapAgentValue(stringValue(out[config.agentColumn]), maps);
  }
  if (typeof out.agent === "string") out.agent = mapAgentValue(out.agent, maps);
  if (typeof out.primary_agent_id === "string") out.primary_agent_id = mapAgentValue(out.primary_agent_id, maps);

  for (const [column, tableName] of Object.entries(config.remapColumns || {})) {
    const value = out[column];
    if (typeof value === "string" && value) out[column] = remapValue(tableName, value, maps);
  }

  for (const [column, tableName] of Object.entries(config.arrayRemapColumns || {})) {
    const value = out[column];
    if (Array.isArray(value)) {
      out[column] = value.map((item) =>
        typeof item === "string"
          ? tableName === "agent" ? mapAgentValue(item, maps) : remapValue(tableName, item, maps)
          : item
      ) as JsonValue;
    }
  }

  for (const column of config.disableOnImport || []) out[column] = false;
  for (const column of config.jsonColumns || []) {
    if (isRecord(out[column]) || Array.isArray(out[column])) {
      out[column] = rewriteJsonStorageRefs(out[column], maps) as JsonValue;
    }
  }

  if (isRecord(out.provenance)) {
    out.provenance = addImportProvenance(out.provenance, exportId, importJobId, sourceId);
  }
  if (isRecord(out.source_context)) {
    out.source_context = addImportProvenance(out.source_context, exportId, importJobId, sourceId);
  }
  if (Array.isArray(out.attachments)) {
    out.attachments = rewriteJsonStorageRefs(out.attachments, maps) as JsonValue;
  }
  if (isRecord(out.metadata)) {
    out.metadata = rewriteJsonStorageRefs(out.metadata, maps) as JsonValue;
  }
  if (config.name === "scheduled_tasks") {
    out.last_run_at = null;
    out.last_run_status = null;
    out.next_run_at = null;
  }
  const sourceTimestamp = new Date().toISOString();
  if ("created_by" in out) out.created_by = targetUserId;
  if ("updated_at" in out && typeof out.updated_at !== "string") out.updated_at = sourceTimestamp;
  return out;
}

export function buildRowMapRows(
  payload: AccountExportPayload,
  maps: ImportIdMaps,
  importJobId: string,
  targetUserId: string,
): JsonRecord[] {
  const rows: JsonRecord[] = [];
  for (const config of PORTABLE_TABLES) {
    for (const row of payload.tables[config.name] || []) {
      if (config.readOnly) continue;
      const sourceId = sourceRowId(config, row);
      const targetId = sourceId ? maps.ids[config.name]?.[sourceId] : undefined;
      if (!sourceId || !targetId) continue;
      const sourceAgent = config.agentColumn ? stringValue(row[config.agentColumn]) : null;
      rows.push({
        job_id: importJobId,
        user_id: targetUserId,
        table_name: config.name,
        source_id: sourceId,
        target_id: targetId,
        source_agent_id: sourceAgent,
        target_agent_id: sourceAgent ? mapAgentValue(sourceAgent, maps) : null,
      });
    }
  }
  return rows;
}

export function sourceRowId(config: PortableTableConfig, row: JsonRecord): string {
  if (config.idColumn && typeof row[config.idColumn] === "string") return row[config.idColumn] as string;
  if (config.singleton && config.userColumn && typeof row[config.userColumn] === "string") {
    const agent = config.agentColumn && typeof row[config.agentColumn] === "string" ? `:${row[config.agentColumn]}` : "";
    const doc = typeof row.doc_type === "string" ? `:${row.doc_type}` : "";
    return `${config.name}:${row[config.userColumn]}${agent}${doc}`;
  }
  return "";
}

export function collectStorageRefsFromTables(tables: Record<string, JsonRecord[]>): Array<{ bucket: string; path: string }> {
  const refs = new Map<string, { bucket: string; path: string }>();
  const add = (bucket: string, path: string) => {
    if (!bucket || !path) return;
    refs.set(`${bucket}/${path}`, { bucket, path });
  };

  const scan = (value: JsonValue, fallbackBucket?: string) => {
    if (Array.isArray(value)) {
      value.forEach((item) => scan(item, fallbackBucket));
      return;
    }
    if (!isRecord(value)) return;
    const bucket = typeof value.bucket === "string" ? value.bucket : fallbackBucket;
    const path = typeof value.path === "string" ? value.path : "";
    if (bucket && path) add(bucket, path);
    const storagePath = typeof value.storage_path === "string" ? value.storage_path : "";
    if (storagePath) add(bucket || inferBucketForStoragePath(storagePath), stripBucketPrefix(storagePath));
    for (const nested of Object.values(value)) scan(nested, bucket);
  };

  for (const [table, rows] of Object.entries(tables)) {
    const fallback = table === "profile_items" ? "profile-uploads" : undefined;
    for (const row of rows) scan(row, fallback);
  }
  return [...refs.values()];
}

export function rewriteStoragePathForUser(asset: PortableAsset, sourceUserId: string, targetUserId: string, importJobId: string): string {
  const cleanPath = asset.path.replace(/^\/+/, "");
  if (asset.bucket === "workspace-files") {
    return cleanPath.replace(new RegExp(`^workspaces/${escapeRegExp(sourceUserId)}/`), `workspaces/${targetUserId}/`);
  }
  if (cleanPath.startsWith(`${sourceUserId}/`)) {
    return cleanPath.replace(new RegExp(`^${escapeRegExp(sourceUserId)}/`), `${targetUserId}/`);
  }
  return `imported/${targetUserId}/${importJobId}/${cleanPath.split("/").map(safePathPart).join("/")}`;
}

export function archiveFileName(exportId: string): string {
  return `polyphonic-export-${exportId.slice(0, 8)}.polyphonic-export`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeJson(value: unknown): JsonValue {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value as JsonValue;
  if (Array.isArray(value)) return value.map(sanitizeJson);
  if (typeof value === "object") {
    const out: JsonRecord = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) out[key] = sanitizeJson(nested);
    return out;
  }
  return String(value);
}

async function deriveNewArchiveKey(passphrase: string): Promise<{ key: CryptoKey; salt: Uint8Array; iterations: number }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 250_000;
  const key = await deriveArchiveKey(passphrase, salt, iterations);
  return { key, salt, iterations };
}

async function deriveExistingArchiveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  return deriveArchiveKey(passphrase, salt, iterations);
}

async function deriveArchiveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  if (!passphrase || passphrase.length < 8) throw new Error("Passphrase must be at least 8 characters");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mapAgentId(sourceAgentId: string, existingAgentIds: Set<string>, exportId: string): string {
  if (RESIDENT_AGENT_IDS.has(sourceAgentId)) return sourceAgentId;
  if (!existingAgentIds.has(sourceAgentId)) return sourceAgentId;
  const slug = sourceAgentId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "agent";
  return `restored-${slug}-${exportId.slice(0, 8)}`;
}

function mapAgentValue(value: string, maps: ImportIdMaps): string {
  if (!value) return value;
  return maps.agents[value] || value;
}

function remapValue(tableName: string, value: string, maps: ImportIdMaps): string | null {
  return maps.ids[tableName]?.[value] || null;
}

function addImportProvenance(value: JsonRecord, exportId: string, importJobId: string, sourceId: string): JsonRecord {
  return {
    ...value,
    account_portability: {
      source_export_id: exportId,
      source_id: sourceId,
      import_job_id: importJobId,
      imported_at: new Date().toISOString(),
    },
  };
}

function rewriteJsonStorageRefs(value: JsonValue, maps: ImportIdMaps): JsonValue {
  if (Array.isArray(value)) return value.map((item) => rewriteJsonStorageRefs(item, maps));
  if (!isRecord(value)) return value;
  const out: JsonRecord = {};
  for (const [key, nested] of Object.entries(value)) out[key] = rewriteJsonStorageRefs(nested, maps);
  const bucket = typeof out.bucket === "string" ? out.bucket : undefined;
  const path = typeof out.path === "string" ? out.path : undefined;
  if (bucket && path) {
    const mapped = maps.assets[`${bucket}/${path}`];
    if (mapped) {
      out.bucket = mapped.bucket;
      out.path = mapped.path;
      if (mapped.signedUrl) out.url = mapped.signedUrl;
    }
  }
  const storagePath = typeof out.storage_path === "string" ? out.storage_path : undefined;
  if (storagePath) {
    const inferredBucket = bucket || inferBucketForStoragePath(storagePath);
    const mapped = maps.assets[`${inferredBucket}/${stripBucketPrefix(storagePath)}`];
    if (mapped) {
      out.storage_path = mapped.path;
      if (mapped.signedUrl && typeof out.url === "string") out.url = mapped.signedUrl;
    }
  }
  const meta = isRecord(out.meta) ? out.meta : null;
  if (typeof out.url === "string" && typeof meta?.url === "string") {
    out.url = meta.url;
  }
  const metaBucket = typeof meta?.bucket === "string" ? meta.bucket : undefined;
  const metaPath = typeof meta?.path === "string" ? meta.path : undefined;
  if (metaBucket && metaPath && typeof out.url === "string") {
    const mapped = maps.assets[`${metaBucket}/${metaPath}`];
    if (mapped?.signedUrl) out.url = mapped.signedUrl;
  }
  const metaStoragePath = typeof meta?.storage_path === "string" ? meta.storage_path : undefined;
  if (metaStoragePath && typeof out.url === "string") {
    const inferredBucket = inferBucketForStoragePath(metaStoragePath);
    const mapped = maps.assets[`${inferredBucket}/${stripBucketPrefix(metaStoragePath)}`];
    if (mapped?.signedUrl) out.url = mapped.signedUrl;
  }
  return out;
}

function inferBucketForStoragePath(path: string): string {
  if (path.startsWith("workspaces/")) return "workspace-files";
  if (path.startsWith("profile-uploads/")) return "profile-uploads";
  return "generated-images";
}

function stripBucketPrefix(path: string): string {
  return path.replace(/^(generated-images|profile-uploads|chat-attachments|workspace-files)\//, "");
}

function stringValue(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 96) || "asset";
}
