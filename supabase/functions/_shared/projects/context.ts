type SupabaseLike = {
  from: (table: string) => any;
};

export interface ProjectContext {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
}

const MAX_PROJECT_FIELD_CHARS = 4000;

export async function loadProjectContextForThread(
  supabase: SupabaseLike,
  userId: string,
  threadId: string | null | undefined,
): Promise<ProjectContext | null> {
  if (!threadId) return null;

  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("project_id")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (threadError) {
    console.warn("[projects] failed to load thread project", threadError);
    return null;
  }

  const projectId = typeof thread?.project_id === "string" ? thread.project_id : null;
  if (!projectId) return null;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, description, instructions")
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("archived", false)
    .maybeSingle();

  if (projectError) {
    console.warn("[projects] failed to load project context", projectError);
    return null;
  }

  if (!project?.id || !project?.name) return null;
  return project as ProjectContext;
}

export function formatProjectContextPrompt(project: ProjectContext | null): string {
  if (!project) return "";

  const description = clip(project.description);
  const instructions = clip(project.instructions);
  const lines = [
    "## Current project",
    `Project: ${clip(project.name, 200)}`,
    description ? `Description: ${description}` : "",
    instructions ? `Instructions:\n${instructions}` : "",
    "Use this as the active project workspace for this thread. Project instructions shape this work, but explicit user messages, user memory controls, and locked identity remain higher priority. Do not mention project mechanics unless it helps the user.",
  ].filter(Boolean);

  return `\n${lines.join("\n\n")}`;
}

function clip(value: string | null | undefined, max = MAX_PROJECT_FIELD_CHARS): string {
  const text = (value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}
