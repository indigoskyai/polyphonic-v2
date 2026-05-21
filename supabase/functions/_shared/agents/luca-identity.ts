import { LUCA_SOUL_MD_STARTER } from "./luca-soul-md-starter.ts";
import { LUCA_CONVICTIONS_STARTER } from "./luca-convictions-starter.ts";

export type LucaIdentityDocType = "soul" | "self_model" | "user_model" | "convictions";

export type LucaIdentityDocs = {
  soulMd: string;
  selfModel: string;
  userModel: string;
  convictions: string;
};

type SupabaseLike = {
  from: (table: string) => any;
};

const DOC_TYPES: LucaIdentityDocType[] = ["soul", "self_model", "user_model", "convictions"];

const EMPTY_DOCS: LucaIdentityDocs = {
  soulMd: "",
  selfModel: "",
  userModel: "",
  convictions: "",
};

function mapRows(rows: Array<{ doc_type: LucaIdentityDocType; content: string }> | null | undefined): LucaIdentityDocs {
  const docs = { ...EMPTY_DOCS };
  for (const row of rows || []) {
    if (row.doc_type === "soul") docs.soulMd = row.content || "";
    if (row.doc_type === "self_model") docs.selfModel = row.content || "";
    if (row.doc_type === "user_model") docs.userModel = row.content || "";
    if (row.doc_type === "convictions") docs.convictions = row.content || "";
  }
  return docs;
}

function starterFor(docType: LucaIdentityDocType): string {
  if (docType === "soul") return LUCA_SOUL_MD_STARTER;
  if (docType === "convictions") return LUCA_CONVICTIONS_STARTER;
  return "";
}

export async function loadAgentIdentity(
  supabase: SupabaseLike,
  userId: string,
  agentId = "luca",
): Promise<LucaIdentityDocs> {
  const { data: existing, error: selectError } = await supabase
    .from("agent_identity")
    .select("doc_type, content")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("doc_type", DOC_TYPES);

  if (selectError) {
    console.warn("[luca-identity] select failed:", selectError);
    return EMPTY_DOCS;
  }

  return mapRows(existing);
}

export async function loadOrCreateLucaIdentity(
  supabase: SupabaseLike,
  userId: string,
  agentId = "luca",
): Promise<LucaIdentityDocs> {
  if (agentId !== "luca") {
    return loadAgentIdentity(supabase, userId, agentId);
  }

  const { data: existing, error: selectError } = await supabase
    .from("agent_identity")
    .select("doc_type, content")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("doc_type", DOC_TYPES);

  if (selectError) {
    console.warn("[luca-identity] select failed:", selectError);
    return EMPTY_DOCS;
  }

  const found = new Set((existing || []).map((row: { doc_type: LucaIdentityDocType }) => row.doc_type));
  const missing = DOC_TYPES.filter((docType) => !found.has(docType));

  if (missing.length === 0) return mapRows(existing);

  const seedRows = missing.map((docType) => ({
    user_id: userId,
    agent_id: agentId,
    doc_type: docType,
    content: starterFor(docType),
  }));

  const { error: insertError } = await supabase
    .from("agent_identity")
    .upsert(seedRows, {
      onConflict: "user_id,agent_id,doc_type",
      ignoreDuplicates: true,
    });

  if (insertError) {
    console.warn("[luca-identity] seed failed:", insertError);
    return mapRows(existing);
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from("agent_identity")
    .select("doc_type, content")
    .eq("user_id", userId)
    .eq("agent_id", agentId)
    .in("doc_type", DOC_TYPES);

  if (refreshError) {
    console.warn("[luca-identity] refresh failed:", refreshError);
    return mapRows(existing);
  }

  return mapRows(refreshed);
}
