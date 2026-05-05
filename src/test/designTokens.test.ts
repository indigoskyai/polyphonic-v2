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
  const surfaces = ['canvas', 'surface-1', 'surface-2', 'surface-3', 'surface-5'];

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
