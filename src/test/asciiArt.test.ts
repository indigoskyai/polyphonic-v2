import { describe, it, expect } from "vitest";
import { preprocessAsciiArt } from "@/lib/asciiArt";

describe("preprocessAsciiArt", () => {
  it("leaves plain text unchanged", () => {
    const text = "Hello world\nThis is a normal paragraph.";
    expect(preprocessAsciiArt(text)).toBe(text);
  });

  it("wraps ASCII art lines in code fences", () => {
    const art = `+--------+--------+
|  Name  |  Age   |
+--------+--------+
| Alice  |   30   |
+--------+--------+`;
    const result = preprocessAsciiArt(art);
    expect(result).toContain("```");
    expect(result.startsWith("```")).toBe(true);
    expect(result.endsWith("```")).toBe(true);
  });

  it("handles mixed content: text before and after art", () => {
    const input = `Here is a table:
+------+------+
| col1 | col2 |
+------+------+
And here is more text.`;
    const result = preprocessAsciiArt(input);
    expect(result).toContain("Here is a table:");
    expect(result).toContain("```");
    expect(result).toContain("And here is more text.");
    const fenceCount = (result.match(/```/g) || []).length;
    expect(fenceCount).toBe(2);
  });

  it("does not double-wrap already fenced code", () => {
    const input = "```\n+---+---+\n| a | b |\n+---+---+\n```";
    const result = preprocessAsciiArt(input);
    const fenceCount = (result.match(/```/g) || []).length;
    expect(fenceCount).toBe(2); // original fences only
  });

  it("does not wrap short lines with few special chars", () => {
    const input = "Hi! :)\nOk - sure.";
    expect(preprocessAsciiArt(input)).toBe(input);
  });

  it("detects slash-heavy ASCII art", () => {
    const art = `  /\\_/\\
 ( o.o )
  > ^ <
 /|   |\\
(_|   |_)`;
    const result = preprocessAsciiArt(art);
    expect(result).toContain("```");
  });

  it("handles box-drawing unicode characters", () => {
    const art = `┌──────┐
│ test │
└──────┘`;
    const result = preprocessAsciiArt(art);
    expect(result).toContain("```");
  });

  it("tolerates 1-2 blank lines between art segments", () => {
    const art = `+------+
| head |
+------+

+------+
| body |
+------+`;
    const result = preprocessAsciiArt(art);
    const fenceCount = (result.match(/```/g) || []).length;
    expect(fenceCount).toBe(2); // single wrapped block
  });

  it("does not modify code blocks with language tags", () => {
    const input = "```python\nprint('hello')\n```";
    expect(preprocessAsciiArt(input)).toBe(input);
  });

  it("handles pipe-heavy diagrams (multi-line)", () => {
    const art = `| Step 1 | ---> | Step 2 |
| Step 3 | ---> | Step 4 |`;
    const result = preprocessAsciiArt(art);
    expect(result).toContain("```");
  });
});
