import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DiffBody {
  id_a: string;
  id_b: string;
}

interface DiffLine {
  type: "add" | "del" | "context";
  oldNum?: number;
  newNum?: number;
  text: string;
}

interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

interface FileDiff {
  path: string;
  added: number;
  removed: number;
  hunks: DiffHunk[];
}

// Lightweight unified-diff parser. Accepts a stored unified diff blob
// (e.g. `@@ -1,3 +1,4 @@\n context\n+added\n-removed`) and converts to hunks.
function parseUnifiedDiff(blob: string): DiffHunk[] {
  if (!blob) return [];
  const lines = blob.split("\n");
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldNum = 0;
  let newNum = 0;

  const hunkHeader = /^@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/;

  for (const line of lines) {
    const m = line.match(hunkHeader);
    if (m) {
      if (current) hunks.push(current);
      oldNum = parseInt(m[1], 10);
      newNum = parseInt(m[2], 10);
      current = { oldStart: oldNum, newStart: newNum, lines: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.lines.push({ type: "add", newNum, text: line.slice(1) });
      newNum++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.lines.push({ type: "del", oldNum, text: line.slice(1) });
      oldNum++;
    } else {
      const text = line.startsWith(" ") ? line.slice(1) : line;
      current.lines.push({ type: "context", oldNum, newNum, text });
      oldNum++;
      newNum++;
    }
  }
  if (current) hunks.push(current);
  return hunks;
}

// Naive line-level unified diff between two text blobs (LCS-based).
// Used as fallback when a stored diff_blob isn't present and we have two snapshots.
function computeUnifiedDiff(a: string, b: string): DiffHunk[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const m = aLines.length;
  const n = bLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0, j = 0;
  let oldNum = 1, newNum = 1;
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      lines.push({ type: "context", oldNum, newNum, text: aLines[i] });
      i++; j++; oldNum++; newNum++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: "del", oldNum, text: aLines[i] });
      i++; oldNum++;
    } else {
      lines.push({ type: "add", newNum, text: bLines[j] });
      j++; newNum++;
    }
  }
  while (i < m) { lines.push({ type: "del", oldNum, text: aLines[i] }); i++; oldNum++; }
  while (j < n) { lines.push({ type: "add", newNum, text: bLines[j] }); j++; newNum++; }
  return lines.length ? [{ oldStart: 1, newStart: 1, lines }] : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user_id = userData.user.id;

    let body: DiffBody;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.id_a || !body.id_b) {
      return new Response(JSON.stringify({ error: "id_a and id_b are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify ownership of both checkpoints
    const { data: cps, error: cpsErr } = await admin
      .from("checkpoints")
      .select("id, user_id")
      .in("id", [body.id_a, body.id_b]);

    if (cpsErr) {
      console.error("[checkpoint-diff] checkpoint lookup failed:", cpsErr);
      return new Response(JSON.stringify({ error: cpsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!cps || cps.length !== 2 || cps.some((c) => c.user_id !== user_id)) {
      return new Response(JSON.stringify({ error: "Checkpoints not found or not owned by user" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull files for both checkpoints
    const [{ data: aFiles, error: aErr }, { data: bFiles, error: bErr }] = await Promise.all([
      admin.from("checkpoint_files").select("*").eq("checkpoint_id", body.id_a),
      admin.from("checkpoint_files").select("*").eq("checkpoint_id", body.id_b),
    ]);

    if (aErr || bErr) {
      console.error("[checkpoint-diff] file lookup failed:", aErr ?? bErr);
      return new Response(JSON.stringify({ error: (aErr ?? bErr)?.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aMap = new Map<string, typeof aFiles[number]>(
      (aFiles ?? []).map((f) => [f.path, f]),
    );
    const bMap = new Map<string, typeof bFiles[number]>(
      (bFiles ?? []).map((f) => [f.path, f]),
    );
    const allPaths = new Set<string>([...aMap.keys(), ...bMap.keys()]);

    const fileDiffs: FileDiff[] = [];
    for (const path of allPaths) {
      const a = aMap.get(path);
      const b = bMap.get(path);
      let hunks: DiffHunk[] = [];

      if (b?.diff_blob) {
        // Prefer the newer side's stored unified diff
        hunks = parseUnifiedDiff(b.diff_blob);
      } else if (a?.diff_blob && !b) {
        hunks = parseUnifiedDiff(a.diff_blob);
      } else if (a?.diff_blob && b?.diff_blob) {
        // Compute diff between the two stored blobs as a fallback
        hunks = computeUnifiedDiff(a.diff_blob, b.diff_blob);
      }

      const added = hunks.reduce(
        (sum, h) => sum + h.lines.filter((l) => l.type === "add").length,
        0,
      );
      const removed = hunks.reduce(
        (sum, h) => sum + h.lines.filter((l) => l.type === "del").length,
        0,
      );

      fileDiffs.push({ path, added, removed, hunks });
    }

    return new Response(
      JSON.stringify({
        id_a: body.id_a,
        id_b: body.id_b,
        files: fileDiffs,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("[checkpoint-diff] unexpected error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
