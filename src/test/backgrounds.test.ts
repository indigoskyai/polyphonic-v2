import { describe, it, expect } from "vitest";
import { getBackgroundStyle, BACKGROUND_OPTIONS } from "@/lib/backgrounds";

describe("backgrounds", () => {
  it("returns image style for wallpaper options", () => {
    const style = getBackgroundStyle("wallpaper");
    expect(style).toEqual({
      backgroundImage: "url('/images/landing-bg.png')",
      backgroundSize: "cover",
      backgroundPosition: "center 35%",
      backgroundRepeat: "no-repeat",
    });
  });

  it("returns gradient style for gradient options", () => {
    const style = getBackgroundStyle("gradient-sunset");
    expect(style).toHaveProperty("background");
    expect(style!.background).toContain("linear-gradient");
  });

  it("returns null for 'none' option", () => {
    const style = getBackgroundStyle("none");
    expect(style).toBeNull();
  });

  it("defaults to wallpaper when undefined", () => {
    const style = getBackgroundStyle(undefined);
    expect(style).not.toBeNull();
    expect(style).toHaveProperty("backgroundImage");
  });

  it("returns null for unknown option", () => {
    const style = getBackgroundStyle("nonexistent-id");
    expect(style).toBeNull();
  });

  it("all background options have required fields", () => {
    for (const opt of BACKGROUND_OPTIONS) {
      expect(opt).toHaveProperty("id");
      expect(opt).toHaveProperty("label");
      expect(typeof opt.id).toBe("string");
      expect(typeof opt.label).toBe("string");
    }
  });

  it("image options produce image styles, gradient options produce gradient styles", () => {
    for (const opt of BACKGROUND_OPTIONS) {
      if (!opt.css) continue;
      const style = getBackgroundStyle(opt.id);
      if (opt.isImage) {
        expect(style).toHaveProperty("backgroundImage");
        expect(style).toHaveProperty("backgroundSize", "cover");
      } else {
        expect(style).toHaveProperty("background");
      }
    }
  });
});
