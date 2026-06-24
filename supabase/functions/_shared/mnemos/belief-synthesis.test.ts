// Tests for the belief-synthesis response parser (no network).
// Run: deno test --allow-env supabase/functions/_shared/mnemos/belief-synthesis.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseSynthesisResponse, isUnsafeBeliefContent } from "./consolidation.ts";

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
