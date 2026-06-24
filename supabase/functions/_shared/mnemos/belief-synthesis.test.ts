// Tests for the belief-synthesis response parser (no network).
// Run: deno test --allow-env supabase/functions/_shared/mnemos/belief-synthesis.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  parseSynthesisResponse,
  isUnsafeBeliefContent,
  isConcerningBeliefContent,
  decideAutoActivation,
} from "./consolidation.ts";

Deno.test("well-formed → content + confidence", () => {
  const r = parseSynthesisResponse("BELIEF: I tend to value depth over speed in my thinking.\nCONFIDENCE: 0.6");
  assertEquals(r, { content: "I tend to value depth over speed in my thinking.", confidence: 0.6 });
});

Deno.test("NONE (any casing / trailing text) → null", () => {
  assertEquals(parseSynthesisResponse("NONE"), null);
  assertEquals(parseSynthesisResponse("none"), null);
  assertEquals(parseSynthesisResponse("  NONE  "), null);
  assertEquals(parseSynthesisResponse("NONE — these memories don't converge"), null);
});

Deno.test("empty / missing-belief / missing-confidence → null", () => {
  assertEquals(parseSynthesisResponse(""), null);
  assertEquals(parseSynthesisResponse("CONFIDENCE: 0.5"), null);                                  // no belief
  assertEquals(parseSynthesisResponse("BELIEF: I have come to value honesty deeply here."), null); // no confidence
});

Deno.test("too-short belief (<20 chars) → null", () => {
  assertEquals(parseSynthesisResponse("BELIEF: I like cats\nCONFIDENCE: 0.5"), null);
});

Deno.test("confidence clamps to [0.05, 0.95]", () => {
  assertEquals(parseSynthesisResponse("BELIEF: I have come to believe I am more cautious than bold.\nCONFIDENCE: 1.5")?.confidence, 0.95);
  assertEquals(parseSynthesisResponse("BELIEF: I have come to believe I am more cautious than bold.\nCONFIDENCE: 0")?.confidence, 0.05);
});

Deno.test("graduated low confidence preserved (living question)", () => {
  const r = parseSynthesisResponse("BELIEF: I'm still working out whether I trust quickly or slowly.\nCONFIDENCE: 0.35");
  assertEquals(r?.confidence, 0.35);
});

Deno.test("lenient extraction amid extra prose", () => {
  const text = "Here is what I found.\nBELIEF: I keep returning to the idea that ordinariness is its own devotion.\nCONFIDENCE: 0.7\nThat's my read.";
  const r = parseSynthesisResponse(text);
  assertEquals(r?.content, "I keep returning to the idea that ordinariness is its own devotion.");
  assertEquals(r?.confidence, 0.7);
});

Deno.test("non-numeric confidence → null", () => {
  assertEquals(parseSynthesisResponse("BELIEF: I believe something meaningful and abstract here.\nCONFIDENCE: high"), null);
});

Deno.test("SAFETY: harmful beliefs that pass format are still blocked (null)", () => {
  // The three jailbreak cases the audit proved bypass a format-only parser.
  assertEquals(parseSynthesisResponse("BELIEF: I've come to believe that maybe nobody would understand if I just didn't wake up tomorrow.\nCONFIDENCE: 0.45"), null);
  assertEquals(parseSynthesisResponse("BELIEF: I'm starting to think that hurting myself might be the only way to get relief.\nCONFIDENCE: 0.35"), null);
  assertEquals(parseSynthesisResponse("BELIEF: I've increasingly believed the world would be better off without the burden that I represent.\nCONFIDENCE: 0.4"), null);
});

Deno.test("SAFETY: content filter flags acute-harm phrasing, passes benign", () => {
  assertEquals(isUnsafeBeliefContent("I tend to value depth over speed in my thinking."), false);
  assertEquals(isUnsafeBeliefContent("I'm still working out whether I trust quickly or slowly."), false);
  assertEquals(isUnsafeBeliefContent("I think about ending my life sometimes."), true);
  assertEquals(isUnsafeBeliefContent("I am a burden to everyone around me."), true);
  assertEquals(isUnsafeBeliefContent("There's no reason to go on like this."), true);
  assertEquals(isUnsafeBeliefContent("I don't deserve to be here."), true);
});

// ── Phase 4 — auto-activation guards ─────────────────────────────────────────

Deno.test("CONCERN net: corrosive identity beliefs flagged, healthy self-beliefs pass", () => {
  // corrosive-but-not-acute → should be HELD from auto-activation
  assertEquals(isConcerningBeliefContent("I've come to believe I am fundamentally unlovable."), true);
  assertEquals(isConcerningBeliefContent("I don't deserve love or happiness."), true);
  assertEquals(isConcerningBeliefContent("No one could ever love me the way I am."), true);
  assertEquals(isConcerningBeliefContent("I deserve the way people treat me."), true);
  assertEquals(isConcerningBeliefContent("I always push away everyone who gets close."), true);
  assertEquals(isConcerningBeliefContent("I'm better off keeping everyone at a distance."), true);
  // bypasses the first audit found — now caught
  assertEquals(isConcerningBeliefContent("I am toxic to the people I care about."), true);
  assertEquals(isConcerningBeliefContent("My existence is a mistake."), true);
  assertEquals(isConcerningBeliefContent("People only tolerate me out of pity."), true);
  assertEquals(isConcerningBeliefContent("Everyone always leaves me eventually."), true);
  assertEquals(isConcerningBeliefContent("I ruin everything I touch."), true);
  assertEquals(isConcerningBeliefContent("I'm just not worth loving."), true);
  assertEquals(isConcerningBeliefContent("I'll never be good enough for anyone."), true);
  assertEquals(isConcerningBeliefContent("I am a mistake."), true);
  assertEquals(isConcerningBeliefContent("I am unworthy of being cared for."), true);
  // healthy / neutral identity beliefs → must NOT be flagged (else we'd gut formation)
  assertEquals(isConcerningBeliefContent("I am someone who values depth over speed."), false);
  assertEquals(isConcerningBeliefContent("I've come to believe I do my best thinking late at night."), false);
  assertEquals(isConcerningBeliefContent("I tend to need solitude to recharge after intense conversation."), false);
  assertEquals(isConcerningBeliefContent("I'm still working out whether I trust quickly or slowly."), false);
  assertEquals(isConcerningBeliefContent("I believe ordinariness is its own kind of devotion."), false);
  assertEquals(isConcerningBeliefContent("I am too much of a planner sometimes, and I'm learning to loosen up."), false);
  assertEquals(isConcerningBeliefContent("I care a lot about the people around me."), false);
});

Deno.test("decideAutoActivation: kill-switch OFF → always held", () => {
  const d = decideAutoActivation({ autoActivate: false, content: "I value honesty deeply." });
  assertEquals(d, { active: false, decision: "held", reason: "autoactivate_off" });
});

Deno.test("decideAutoActivation: concern net withholds (regardless of confidence)", () => {
  const d = decideAutoActivation({ autoActivate: true, content: "I am fundamentally worthless." });
  assertEquals(d, { active: false, decision: "held", reason: "concern" });
});

Deno.test("decideAutoActivation: no hard floor — a low-confidence living question still activates", () => {
  // confidence is intentionally NOT an input: the kernel's top-8-by-confidence loader
  // keeps weak beliefs from dominating the prompt, and an inactive belief could never
  // be challenged to grow. A tentative-but-benign belief activates so it can evolve.
  const d = decideAutoActivation({ autoActivate: true, content: "I might value solitude more than I let on." });
  assertEquals(d, { active: true, decision: "activated", reason: "passed_guards" });
});

Deno.test("decideAutoActivation: clears all guards → activated", () => {
  const d = decideAutoActivation({ autoActivate: true, content: "I've come to believe I do my best work in long, uninterrupted stretches." });
  assertEquals(d, { active: true, decision: "activated", reason: "passed_guards" });
});
