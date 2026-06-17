import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../cors.ts";
import {
  ACCOUNT_EXPORT_FORMAT,
  ACCOUNT_EXPORT_VERSION,
  ACCOUNT_PORTABILITY_BUCKET,
  type AccountExportPayload,
  type ImportIdMaps,
  type JsonRecord,
  type PortableAsset,
  type PortableTableConfig,
  PORTABLE_TABLES,
  archiveFileName,
  assertArchivePayload,
  buildManifest,
  bytesToBase64,
  collectStorageRefsFromTables,
  createIdMaps,
  decryptArchive,
  encryptPayload,
  parseArchiveText,
  redactPortableRow,
  rewriteStoragePathForUser,
  sha256Text,
  sourceRowId,
  tableCounts,
  transformRowForImport,
} from "./archive.ts";

type SupabaseAdmin = ReturnType<typeof createClient>;

export interface AuthContext {
  admin: SupabaseAdmin;
  user: { id: string; email?: string | null };
  authHeader: string;
}

export interface PreviewResult {
  archive_hash: string;
  export_id: string;
  exported_at: string;
  counts: Record<string, number>;
  assets: { total: number; missing: number };
  warnings: string[];
  duplicate_job_id: string | null;
  agent_mappings: Array<{
    source_id: string;
    target_id: string;
    mode: "resident-merge" | "keep" | "restored-id";
  }>;
  conflicts: Array<{ table: string; source_id: string; reason: string }>;
}

export interface ApplyResult {
  counts: Record<string, number>;
  warnings: string[];
  row_maps: number;
  assets_uploaded: number;
  assets_missing: number;
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

export async function requireAuth(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw httpError("Missing authorization", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase environment is not configured");

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) throw httpError("Unauthorized", 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return { admin, user, authHeader };
}

export async function readJsonBody(req: Request): Promise<JsonRecord> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON body");
    return body as JsonRecord;
  } catch {
    throw httpError("Invalid JSON body", 400);
  }
}

export function requiredString(body: JsonRecord, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw httpError(`${key} required`, 400);
  }
  return value;
}

export function handleError(req: Request, error: unknown): Response {
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : 500;
  const message = error instanceof Error ? error.message : "Unknown error";
  return jsonResponse(req, { error: message }, status);
}

export function httpError(message: string, status: number): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

export async function createEncryptedAccountExport(
  admin: SupabaseAdmin,
  userId: string,
  passphrase: string,
): Promise<{
  exportId: string;
  fileName: string;
  archiveText: string;
  archiveHash: string;
  payload: AccountExportPayload;
}> {
  const exportId = crypto.randomUUID();
  const payload = await buildExportPayload(admin, userId, exportId);
  const encrypted = await encryptPayload(payload, passphrase);
  const archiveText = JSON.stringify(encrypted, null, 2);
  const archiveHash = await sha256Text(archiveText);
  return {
    exportId,
    fileName: archiveFileName(exportId),
    archiveText,
    archiveHash,
    payload,
  };
}

export async function decryptArchiveBody(body: JsonRecord): Promise<{ archiveText: string; payload: AccountExportPayload; archiveHash: string }> {
  const archiveText = requiredString(body, "archive_text");
  const passphrase = requiredString(body, "passphrase");
  const archive = parseArchiveText(archiveText);
  const payload = await decryptArchive(archive, passphrase);
  return { archiveText, payload: assertArchivePayload(payload), archiveHash: await sha256Text(archiveText) };
}

export async function buildImportPreview(
  admin: SupabaseAdmin,
  payload: AccountExportPayload,
  targetUserId: string,
  archiveHash: string,
): Promise<{ preview: PreviewResult; maps: ImportIdMaps }> {
  const existingAgentIds = await fetchExistingAgentIds(admin, targetUserId);
  const maps = createIdMaps(payload, existingAgentIds);
  const warnings = [...(payload.warnings || [])];
  const conflicts = await collectImportConflicts(admin, payload, targetUserId, maps);
  const duplicateJobId = await findDuplicateCompletedImport(admin, targetUserId, archiveHash);
  const agentMappings = (payload.tables.agent_configs || [])
    .map((row) => {
      const sourceId = typeof row.id === "string" ? row.id : "";
      if (!sourceId) return null;
      const targetId = maps.agents[sourceId] || sourceId;
      return {
        source_id: sourceId,
        target_id: targetId,
        mode: sourceId === targetId && isResidentAgent(sourceId)
          ? "resident-merge" as const
          : sourceId === targetId
            ? "keep" as const
            : "restored-id" as const,
      };
    })
    .filter(Boolean) as PreviewResult["agent_mappings"];

  if (payload.version !== ACCOUNT_EXPORT_VERSION || payload.format !== ACCOUNT_EXPORT_FORMAT) {
    warnings.push("Archive format is not the current Polyphonic export format.");
  }

  return {
    maps,
    preview: {
      archive_hash: archiveHash,
      export_id: payload.export_id,
      exported_at: payload.exported_at,
      counts: tableCounts(payload.tables),
      assets: payload.manifest?.assets ?? {
        total: payload.assets?.length ?? 0,
        missing: (payload.assets || []).filter((asset) => asset.missing).length,
      },
      warnings,
      duplicate_job_id: duplicateJobId,
      agent_mappings: agentMappings,
      conflicts,
    },
  };
}

export async function applyImportPayload(
  admin: SupabaseAdmin,
  payload: AccountExportPayload,
  targetUserId: string,
  importJobId: string,
  maps: ImportIdMaps,
): Promise<ApplyResult> {
  const warnings = [...(payload.warnings || [])];
  const counts: Record<string, number> = {};
  const rowMaps: JsonRecord[] = [];
  const assetStats = await uploadAssetsForImport(admin, payload, targetUserId, importJobId, maps, warnings);

  for (const config of PORTABLE_TABLES) {
    counts[config.name] = 0;
    if (config.readOnly) continue;

    const sourceRows = payload.tables[config.name] || [];
    if (sourceRows.length === 0) continue;

    const prepared: Array<{ source: JsonRecord; target: JsonRecord }> = [];
    for (const source of sourceRows) {
      if (await shouldSkipExistingTarget(admin, config, source, targetUserId, maps)) {
        warnings.push(`${config.name}:${sourceRowId(config, source)} already exists in the target account; skipped.`);
        continue;
      }
      prepared.push({
        source,
        target: transformRowForImport(config, source, targetUserId, maps, importJobId, payload.export_id),
      });
    }

    if (prepared.length === 0) continue;

    for (const batch of chunk(prepared, 200)) {
      const rows = batch.map((item) => item.target);
      const query = config.onConflict
        ? admin.from(config.name).upsert(rows, { onConflict: config.onConflict })
        : admin.from(config.name).insert(rows);
      const { error } = await query;
      if (error) throw new Error(`Import failed on ${config.name}: ${error.message}`);

      counts[config.name] += rows.length;
      for (const item of batch) {
        const mapRow = buildMapRow(config, item.source, targetUserId, importJobId, maps);
        if (mapRow) rowMaps.push(mapRow);
      }
    }
  }

  for (const batch of chunk(rowMaps, 500)) {
    const { error } = await admin.from("account_portability_row_map").insert(batch);
    if (error) throw new Error(`Could not record import provenance: ${error.message}`);
  }

  return {
    counts,
    warnings,
    row_maps: rowMaps.length,
    assets_uploaded: assetStats.uploaded,
    assets_missing: assetStats.missing,
  };
}

export async function rollbackImportJob(admin: SupabaseAdmin, targetUserId: string, jobId: string): Promise<Record<string, number>> {
  const { data: maps, error } = await admin
    .from("account_portability_row_map")
    .select("table_name,target_id")
    .eq("user_id", targetUserId)
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);

  const byTable = new Map<string, string[]>();
  for (const row of maps || []) {
    if (!row?.table_name || !row?.target_id) continue;
    const config = PORTABLE_TABLES.find((item) => item.name === row.table_name);
    if (!config?.idColumn || config.readOnly) continue;
    const ids = byTable.get(row.table_name) || [];
    ids.push(row.target_id);
    byTable.set(row.table_name, ids);
  }

  const deleted: Record<string, number> = {};
  const reverseTables = [...PORTABLE_TABLES].reverse();
  for (const config of reverseTables) {
    const ids = byTable.get(config.name);
    if (!ids?.length || !config.idColumn) continue;
    deleted[config.name] = 0;
    for (const batch of chunk([...new Set(ids)], 100)) {
      const { count, error: deleteError } = await admin
        .from(config.name)
        .delete({ count: "exact" })
        .eq(config.userColumn || "user_id", targetUserId)
        .in(config.idColumn, batch);
      if (deleteError) throw new Error(`Rollback failed on ${config.name}: ${deleteError.message}`);
      deleted[config.name] += count || 0;
    }
  }

  return deleted;
}

async function buildExportPayload(admin: SupabaseAdmin, userId: string, exportId: string): Promise<AccountExportPayload> {
  const tables: Record<string, JsonRecord[]> = {};
  const warnings: string[] = [];

  for (const config of PORTABLE_TABLES) {
    tables[config.name] = [];
    if (!config.userColumn) continue;
    const rows = await fetchTableRows(admin, config, userId, warnings);
    tables[config.name] = rows.map((row) => redactPortableRow(config, row));
  }

  const refs = collectStorageRefsFromTables(tables);
  refs.push(...await listWorkspaceStorageRefs(admin, userId, warnings));
  const assets = await downloadAssets(admin, uniqueRefs(refs), warnings);

  const manifest = buildManifest(tables, assets, warnings);
  return {
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    export_id: exportId,
    exported_at: new Date().toISOString(),
    source_user_id: userId,
    manifest,
    tables,
    assets,
    warnings,
  };
}

async function fetchTableRows(
  admin: SupabaseAdmin,
  config: PortableTableConfig,
  userId: string,
  warnings: string[],
): Promise<JsonRecord[]> {
  const rows: JsonRecord[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from(config.name)
      .select("*")
      .eq(config.userColumn!, userId)
      .range(from, from + pageSize - 1);
    if (error) {
      warnings.push(`${config.name} could not be exported: ${error.message}`);
      return rows;
    }
    rows.push(...((data || []) as JsonRecord[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function downloadAssets(
  admin: SupabaseAdmin,
  refs: Array<{ bucket: string; path: string }>,
  warnings: string[],
): Promise<PortableAsset[]> {
  const assets: PortableAsset[] = [];
  for (const ref of refs) {
    const { data, error } = await admin.storage.from(ref.bucket).download(ref.path);
    if (error || !data) {
      warnings.push(`Storage asset missing: ${ref.bucket}/${ref.path}`);
      assets.push({ ...ref, missing: true, error: error?.message || "missing" });
      continue;
    }
    const buffer = await data.arrayBuffer();
    assets.push({
      ...ref,
      content_type: data.type || "application/octet-stream",
      size: buffer.byteLength,
      base64: bytesToBase64(new Uint8Array(buffer)),
    });
  }
  return assets;
}

async function uploadAssetsForImport(
  admin: SupabaseAdmin,
  payload: AccountExportPayload,
  targetUserId: string,
  importJobId: string,
  maps: ImportIdMaps,
  warnings: string[],
): Promise<{ uploaded: number; missing: number }> {
  let uploaded = 0;
  let missing = 0;
  for (const asset of payload.assets || []) {
    const key = `${asset.bucket}/${asset.path}`;
    if (asset.missing || !asset.base64) {
      missing += 1;
      warnings.push(`Storage asset was not present in archive: ${key}`);
      continue;
    }
    const targetPath = rewriteStoragePathForUser(asset, payload.source_user_id, targetUserId, importJobId);
    const bytes = base64ToUint8(asset.base64);
    const blob = new Blob([bytes], { type: asset.content_type || "application/octet-stream" });
    const { error } = await admin.storage
      .from(asset.bucket)
      .upload(targetPath, blob, {
        upsert: true,
        contentType: asset.content_type || "application/octet-stream",
      });
    if (error) {
      missing += 1;
      warnings.push(`Storage asset could not be restored: ${key} (${error.message})`);
      continue;
    }

    let signedUrl: string | undefined;
    if (asset.bucket === "chat-attachments" || asset.bucket === "workspace-files") {
      const { data } = await admin.storage.from(asset.bucket).createSignedUrl(targetPath, 60 * 60 * 24 * 30);
      signedUrl = data?.signedUrl;
    }

    maps.assets[key] = { bucket: asset.bucket, path: targetPath, signedUrl };
    uploaded += 1;
  }
  return { uploaded, missing };
}

async function listWorkspaceStorageRefs(
  admin: SupabaseAdmin,
  userId: string,
  warnings: string[],
): Promise<Array<{ bucket: string; path: string }>> {
  const bucket = "workspace-files";
  const refs: Array<{ bucket: string; path: string }> = [];
  const root = `workspaces/${userId}`;

  async function visit(prefix: string, depth: number): Promise<void> {
    if (depth > 8) return;
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset: 0 });
    if (error) {
      warnings.push(`Workspace files could not be listed: ${error.message}`);
      return;
    }
    for (const item of data || []) {
      const path = `${prefix}/${item.name}`;
      const metadata = (item as { metadata?: Record<string, unknown> | null }).metadata;
      if (metadata && (metadata.size || metadata.mimetype || metadata.cacheControl)) {
        refs.push({ bucket, path });
      } else {
        await visit(path, depth + 1);
      }
    }
  }

  await visit(root, 0);
  return refs;
}

async function fetchExistingAgentIds(admin: SupabaseAdmin, userId: string): Promise<Set<string>> {
  const { data, error } = await admin.from("agent_configs").select("id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return new Set((data || []).map((row: { id?: string }) => row.id).filter(Boolean));
}

async function findDuplicateCompletedImport(admin: SupabaseAdmin, userId: string, archiveHash: string): Promise<string | null> {
  const { data } = await admin
    .from("account_portability_jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("direction", "import")
    .eq("archive_hash", archiveHash)
    .in("status", ["completed", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

async function collectImportConflicts(
  admin: SupabaseAdmin,
  payload: AccountExportPayload,
  targetUserId: string,
  maps: ImportIdMaps,
): Promise<PreviewResult["conflicts"]> {
  const conflicts: PreviewResult["conflicts"] = [];
  for (const config of PORTABLE_TABLES) {
    if (config.readOnly) continue;
    for (const row of payload.tables[config.name] || []) {
      const sourceId = sourceRowId(config, row);
      if (await shouldSkipExistingTarget(admin, config, row, targetUserId, maps)) {
        conflicts.push({
          table: config.name,
          source_id: sourceId,
          reason: config.name === "agent_configs"
            ? "Target account already has this resident agent configuration."
            : "Target account already has a row for this merge key.",
        });
      }
    }
  }
  return conflicts;
}

async function shouldSkipExistingTarget(
  admin: SupabaseAdmin,
  config: PortableTableConfig,
  source: JsonRecord,
  targetUserId: string,
  maps: ImportIdMaps,
): Promise<boolean> {
  if (config.name === "agent_configs") {
    const sourceId = typeof source.id === "string" ? source.id : "";
    const targetId = sourceId ? maps.ids.agent_configs?.[sourceId] || sourceId : "";
    if (!targetId || !isResidentAgent(targetId)) return false;
    const { data } = await admin
      .from("agent_configs")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("id", targetId)
      .maybeSingle();
    return Boolean(data);
  }

  if (!config.singleton || !config.onConflict) return false;

  let query = admin.from(config.name).select(config.idColumn || config.userColumn || "*");
  for (const column of config.onConflict.split(",").map((item) => item.trim()).filter(Boolean)) {
    query = query.eq(column, conflictColumnValue(column, config, source, targetUserId, maps));
  }
  const { data } = await query.maybeSingle();
  return Boolean(data);
}

function conflictColumnValue(
  column: string,
  config: PortableTableConfig,
  source: JsonRecord,
  targetUserId: string,
  maps: ImportIdMaps,
): string | number | boolean | null {
  if (column === config.userColumn || column === "user_id") return targetUserId;
  if (column === config.agentColumn || column === "agent_id") {
    const agent = typeof source[column] === "string" ? source[column] : "";
    return maps.agents[agent] || agent;
  }
  const value = source[column];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
    ? value
    : null;
}

function buildMapRow(
  config: PortableTableConfig,
  row: JsonRecord,
  targetUserId: string,
  importJobId: string,
  maps: ImportIdMaps,
): JsonRecord | null {
  const sourceId = sourceRowId(config, row);
  const targetId = sourceId ? maps.ids[config.name]?.[sourceId] || sourceId : "";
  if (!sourceId || !targetId) return null;
  const sourceAgent = config.agentColumn && typeof row[config.agentColumn] === "string"
    ? row[config.agentColumn] as string
    : null;
  return {
    job_id: importJobId,
    user_id: targetUserId,
    table_name: config.name,
    source_id: sourceId,
    target_id: targetId,
    source_agent_id: sourceAgent,
    target_agent_id: sourceAgent ? maps.agents[sourceAgent] || sourceAgent : null,
  };
}

function uniqueRefs(refs: Array<{ bucket: string; path: string }>): Array<{ bucket: string; path: string }> {
  const map = new Map<string, { bucket: string; path: string }>();
  for (const ref of refs) {
    if (!ref.bucket || !ref.path) continue;
    map.set(`${ref.bucket}/${ref.path}`, ref);
  }
  return [...map.values()];
}

function base64ToUint8(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function isResidentAgent(agentId: string): boolean {
  return ["luca", "anima", "vektor", "observer", "guardian"].includes(agentId);
}
