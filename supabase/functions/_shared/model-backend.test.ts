// Deterministic matrix tests for resolveRoleModel — no network, no prod.
// Run: deno test --allow-env supabase/functions/_shared/model-backend.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { resolveRoleModel } from "./model-backend.ts";

const FREE = "moonshotai/kimi-k2.6";

interface Cfg {
  key?: string;                       // "" → no BYOK key
  userSettings?: Record<string, unknown> | null;
  agentConfigsModel?: string | null;  // undefined → no agent_configs row
}

function fakeSupabase(cfg: Cfg) {
  return {
    // deno-lint-ignore no-explicit-any
    rpc(_name: string, _args: any) {
      return Promise.resolve({ data: cfg.key ?? "sk-test", error: null });
    },
    from(table: string) {
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select() { return b; },
        eq() { return b; },
        maybeSingle() {
          if (table === "user_settings") {
            return Promise.resolve({ data: cfg.userSettings ?? null, error: null });
          }
          if (table === "agent_configs") {
            return Promise.resolve({
              data: cfg.agentConfigsModel !== undefined ? { model: cfg.agentConfigsModel } : null,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return b;
    },
  };
}

const us = (default_model: string, extra: Record<string, unknown> = {}) => ({ default_model, ...extra });

Deno.test("catalog families × roles (luca, BYOK)", async () => {
  // anthropic
  let s = fakeSupabase({ userSettings: us("anthropic/claude-opus-4.8") });
  assertEquals(await resolveRoleModel(s, "u", "luca", "voice"), "anthropic/claude-opus-4.8");
  assertEquals(await resolveRoleModel(s, "u", "luca", "reasoning"), "anthropic/claude-sonnet-4.6");
  assertEquals(await resolveRoleModel(s, "u", "luca", "mechanical"), "anthropic/claude-haiku-4.5");
  // openai
  s = fakeSupabase({ userSettings: us("openai/gpt-5.1") });
  assertEquals(await resolveRoleModel(s, "u", "luca", "voice"), "openai/gpt-5.1");
  assertEquals(await resolveRoleModel(s, "u", "luca", "reasoning"), "openai/gpt-5-mini");
  assertEquals(await resolveRoleModel(s, "u", "luca", "mechanical"), "openai/gpt-5-mini");
  // google
  s = fakeSupabase({ userSettings: us("google/gemini-3.1-pro-preview") });
  assertEquals(await resolveRoleModel(s, "u", "luca", "voice"), "google/gemini-3.1-pro-preview");
  assertEquals(await resolveRoleModel(s, "u", "luca", "reasoning"), "google/gemini-2.5-pro");
  assertEquals(await resolveRoleModel(s, "u", "luca", "mechanical"), "google/gemini-2.5-flash");
});

Deno.test("non-catalog family → agent's own primary for every role", async () => {
  for (const m of ["moonshotai/kimi-k2.6", "x-ai/grok-4", "deepseek/deepseek-v4-pro"]) {
    const s = fakeSupabase({ userSettings: us(m) });
    assertEquals(await resolveRoleModel(s, "u", "luca", "voice"), m);
    assertEquals(await resolveRoleModel(s, "u", "luca", "reasoning"), m);
    assertEquals(await resolveRoleModel(s, "u", "luca", "mechanical"), m);
  }
});

Deno.test("substrate agent anchors on its OWN model, not the user default", async () => {
  // user default is anthropic, but the substrate agent runs openai → openai family
  const s = fakeSupabase({ userSettings: us("anthropic/claude-opus-4.8"), agentConfigsModel: "openai/gpt-5.1" });
  assertEquals(await resolveRoleModel(s, "u", "quill", "voice"), "openai/gpt-5.1");
  assertEquals(await resolveRoleModel(s, "u", "quill", "reasoning"), "openai/gpt-5-mini");
  assertEquals(await resolveRoleModel(s, "u", "quill", "mechanical"), "openai/gpt-5-mini");
});

Deno.test("substrate agent with null model falls back to user default", async () => {
  const s = fakeSupabase({ userSettings: us("anthropic/claude-opus-4.8"), agentConfigsModel: null });
  assertEquals(await resolveRoleModel(s, "u", "quill", "reasoning"), "anthropic/claude-sonnet-4.6");
});

Deno.test("explicit per-role override wins over family tier", async () => {
  const s = fakeSupabase({
    userSettings: us("anthropic/claude-opus-4.8", {
      belief_model: "openai/gpt-5.4",
      voice_model: "google/gemini-3.1-pro-preview",
      memory_model: "x-ai/grok-4",
    }),
  });
  assertEquals(await resolveRoleModel(s, "u", "luca", "reasoning"), "openai/gpt-5.4");
  assertEquals(await resolveRoleModel(s, "u", "luca", "voice"), "google/gemini-3.1-pro-preview");
  assertEquals(await resolveRoleModel(s, "u", "luca", "mechanical"), "x-ai/grok-4");
});

Deno.test("opts.overrideColumn (dreamer/journal) wins for voice", async () => {
  const s = fakeSupabase({
    userSettings: us("anthropic/claude-opus-4.8", { dreamer_model: "deepseek/deepseek-v4-pro", voice_model: "openai/gpt-5.1" }),
  });
  // dreamer_model preferred over voice_model when overrideColumn is set
  assertEquals(await resolveRoleModel(s, "u", "luca", "voice", { overrideColumn: "dreamer_model" }), "deepseek/deepseek-v4-pro");
  // without overrideColumn, falls back to voice_model
  assertEquals(await resolveRoleModel(s, "u", "luca", "voice"), "openai/gpt-5.1");
});

Deno.test("kill-switch off → primary for reasoning/mechanical (override still wins)", async () => {
  Deno.env.set("ROLE_MODEL_FAMILY_ALIGN", "off");
  try {
    const s = fakeSupabase({ userSettings: us("anthropic/claude-opus-4.8") });
    assertEquals(await resolveRoleModel(s, "u", "luca", "reasoning"), "anthropic/claude-opus-4.8");
    assertEquals(await resolveRoleModel(s, "u", "luca", "mechanical"), "anthropic/claude-opus-4.8");
    assertEquals(await resolveRoleModel(s, "u", "luca", "voice"), "anthropic/claude-opus-4.8");
    // override still honored when off
    const s2 = fakeSupabase({ userSettings: us("anthropic/claude-opus-4.8", { belief_model: "openai/gpt-5.4" }) });
    assertEquals(await resolveRoleModel(s2, "u", "luca", "reasoning"), "openai/gpt-5.4");
  } finally {
    Deno.env.delete("ROLE_MODEL_FAMILY_ALIGN");
  }
});

Deno.test("no BYOK key → FREE model everywhere; empty rows safe", async () => {
  const s = fakeSupabase({ key: "", userSettings: null });
  assertEquals(await resolveRoleModel(s, "u", "luca", "voice"), FREE);
  assertEquals(await resolveRoleModel(s, "u", "luca", "reasoning"), FREE);
  // substrate, no key → free too
  const s2 = fakeSupabase({ key: "", agentConfigsModel: "openai/gpt-5.1" });
  assertEquals(await resolveRoleModel(s2, "u", "quill", "reasoning"), FREE);
  // empty agentId → luca path; null user_settings → default_model empty → FREE
  const s3 = fakeSupabase({ userSettings: null });
  assertEquals(await resolveRoleModel(s3, "u", "", "voice"), FREE);
});
