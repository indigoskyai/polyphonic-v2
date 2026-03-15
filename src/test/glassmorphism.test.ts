import { describe, it, expect } from "vitest";
import { hasCustomBackground, GLASS_STYLE, GLASS_DROPDOWN_STYLE, GLASS_BUTTON_IMAGE_GEN, GLASS_BUTTON_WEB_SEARCH, GLASS_BUTTON_INACTIVE, GLASS_INPUT_FOCUS_BORDER, GLASS_INPUT_FOCUS_SHADOW } from "@/lib/glassmorphism";

describe("glassmorphism", () => {
  it("hasCustomBackground returns true for wallpaper styles", () => {
    expect(hasCustomBackground("wallpaper")).toBe(true);
    expect(hasCustomBackground("wallpaper-stargazer")).toBe(true);
  });

  it("hasCustomBackground returns true for gradient styles", () => {
    expect(hasCustomBackground("gradient-sunset")).toBe(true);
  });

  it("hasCustomBackground returns false for 'none'", () => {
    expect(hasCustomBackground("none")).toBe(false);
  });

  it("hasCustomBackground defaults to wallpaper (true) for null/undefined", () => {
    expect(hasCustomBackground(null)).toBe(true);
    expect(hasCustomBackground(undefined)).toBe(true);
  });

  it("GLASS_STYLE has required properties", () => {
    expect(GLASS_STYLE).toHaveProperty("background");
    expect(GLASS_STYLE).toHaveProperty("backdropFilter");
    expect(GLASS_STYLE).toHaveProperty("border");
    expect(GLASS_STYLE).toHaveProperty("boxShadow");
  });

  it("GLASS_DROPDOWN_STYLE has required properties", () => {
    expect(GLASS_DROPDOWN_STYLE).toHaveProperty("background");
    expect(GLASS_DROPDOWN_STYLE).toHaveProperty("backdropFilter");
    expect(GLASS_DROPDOWN_STYLE).toHaveProperty("border");
  });

  it("GLASS_BUTTON_IMAGE_GEN has glassmorphic properties", () => {
    expect(GLASS_BUTTON_IMAGE_GEN).toHaveProperty("background");
    expect(GLASS_BUTTON_IMAGE_GEN).toHaveProperty("backdropFilter");
    expect(GLASS_BUTTON_IMAGE_GEN).toHaveProperty("boxShadow");
    expect(GLASS_BUTTON_IMAGE_GEN).toHaveProperty("border");
  });

  it("GLASS_BUTTON_WEB_SEARCH has glassmorphic properties", () => {
    expect(GLASS_BUTTON_WEB_SEARCH).toHaveProperty("background");
    expect(GLASS_BUTTON_WEB_SEARCH).toHaveProperty("backdropFilter");
    expect(GLASS_BUTTON_WEB_SEARCH).toHaveProperty("boxShadow");
  });

  it("GLASS_BUTTON_INACTIVE has subtle glass properties", () => {
    expect(GLASS_BUTTON_INACTIVE).toHaveProperty("background");
    expect(GLASS_BUTTON_INACTIVE).toHaveProperty("backdropFilter");
    expect(GLASS_BUTTON_INACTIVE.background).toContain("0.04");
  });

  it("GLASS_INPUT_FOCUS_BORDER is a semi-transparent white", () => {
    expect(GLASS_INPUT_FOCUS_BORDER).toContain("rgba(255, 255, 255");
    expect(GLASS_INPUT_FOCUS_BORDER).toContain("0.2");
  });

  it("GLASS_INPUT_FOCUS_SHADOW has elevation and inset highlight", () => {
    expect(GLASS_INPUT_FOCUS_SHADOW).toContain("inset");
    expect(GLASS_INPUT_FOCUS_SHADOW).toContain("60px");
  });
});
