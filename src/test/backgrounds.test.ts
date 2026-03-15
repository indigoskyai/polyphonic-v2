import { describe, it, expect } from "vitest";
import { getBackgroundStyle, BACKGROUND_OPTIONS } from "@/lib/backgrounds";

describe("backgrounds", () => {
  it("BACKGROUND_OPTIONS contains only the 'none' entry", () => {
    expect(BACKGROUND_OPTIONS).toHaveLength(1);
    expect(BACKGROUND_OPTIONS[0]).toEqual({ id: "none", label: "None", css: null });
  });

  it("returns null for 'none'", () => {
    expect(getBackgroundStyle("none")).toBeNull();
  });

  it("returns null for wallpaper names", () => {
    expect(getBackgroundStyle("wallpaper")).toBeNull();
    expect(getBackgroundStyle("wallpaper-campfire")).toBeNull();
    expect(getBackgroundStyle("wallpaper-stargazer")).toBeNull();
  });

  it("returns null for gradient names", () => {
    expect(getBackgroundStyle("gradient-sunset")).toBeNull();
    expect(getBackgroundStyle("gradient-dawn")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(getBackgroundStyle(undefined)).toBeNull();
  });

  it("returns null for unknown option", () => {
    expect(getBackgroundStyle("nonexistent-id")).toBeNull();
  });
});
