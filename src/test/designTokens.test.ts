import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing token: ${name}`);
  return match[1].trim();
}

function parseHex(value: string): [number, number, number] {
  const hex = value.trim().replace('#', '');
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function parseRgba(value: string): { rgb: [number, number, number]; alpha: number } {
  const match = value.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  if (!match) throw new Error(`Expected rgba token, got: ${value}`);
  return {
    rgb: [
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10),
      Number.parseInt(match[3], 10),
    ],
    alpha: Number.parseFloat(match[4]),
  };
}

function blend(foreground: [number, number, number], alpha: number, background: [number, number, number]): [number, number, number] {
  return foreground.map((channel, index) => Math.round(channel * alpha + background[index] * (1 - alpha))) as [number, number, number];
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: [number, number, number]): number {
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function tokenContrast(textToken: string, backgroundToken: string): number {
  const background = parseHex(token(backgroundToken));
  const foreground = parseRgba(token(textToken));
  return contrastRatio(blend(foreground.rgb, foreground.alpha, background), background);
}

describe('design token contrast', () => {
  const surfaces = ['canvas', 'surface-3', 'surface-5'];

  it('keeps normal text tokens above WCAG AA contrast on app surfaces', () => {
    for (const text of ['text-primary', 'text-body', 'text-secondary', 'text-mid']) {
      for (const surface of surfaces) {
        expect(tokenContrast(text, surface), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps meta text tokens readable for large labels and secondary UI', () => {
    for (const text of ['text-soft', 'text-tertiary', 'text-ghost']) {
      for (const surface of surfaces) {
        expect(tokenContrast(text, surface), `${text} on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('typography system', () => {
  it('keeps the app on the restored Switzer + Instrument Serif type ladder', () => {
    // Switzer is the primary grotesque (was drifted to Inter); Instrument Serif
    // is the restored accent face; --font-grotesque is deprecated and aliased
    // onto the sans stack (it used to force Inter Tight).
    expect(token('font-sans')).toContain('Switzer');
    expect(token('font-serif')).toContain('Instrument Serif');
    expect(token('font-grotesque')).toContain('var(--font-sans)');
    expect(token('font-mono')).toContain('JetBrains Mono');

    expect(token('weight-thin')).toBe('280');
    expect(token('weight-light')).toBe('320');
    expect(token('weight-book')).toBe('370');
    expect(token('weight-medium')).toBe('450');
    expect(token('type-base')).toBe('14px');
    expect(token('type-3xl')).toBe('35px');
  });

  it('restores intentional negative tracking on display/tight roles and openness on body/ui', () => {
    // Display + tight headings tighten (negative em) — the all-zero drift is gone.
    for (const textToken of ['track-display-tight', 'track-tight', 'track-display']) {
      expect(token(textToken).startsWith('-'), `${textToken} should be negative`).toBe(true);
    }
    // Body + UI roles stay non-negative (a hair of openness, never negative).
    for (const textToken of ['track-body-tight', 'track-body', 'track-ui']) {
      expect(token(textToken).startsWith('-'), `${textToken} should be non-negative`).toBe(false);
    }
    // Mono metadata spacing preserved through the restoration.
    expect(token('track-mono')).toBe('0.08em');
    expect(token('track-meta')).toBe('0.12em');
    expect(token('track-folio')).toBe('0.16em');
  });

  it('keeps settings pages on shared typography roles instead of one-off heavy headings', () => {
    expect(css).toContain('font-size: var(--settings-display-size)');
    expect(css).toContain('font-weight: var(--weight-light)');
    expect(css).toContain('font-size: var(--settings-section-size)');
    expect(css).toContain('font-size: var(--settings-body-size)');
    expect(css).toContain('font-size: var(--settings-mono-size)');
  });
});
