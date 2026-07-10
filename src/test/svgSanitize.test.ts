import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from '@/lib/sanitizeSvg';

describe('sanitizeSvg', () => {
  it('preserves benign svg', () => {
    const s = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3"/></svg>';
    expect(sanitizeSvg(s)).toBe(s);
  });
  it('strips <script> blocks', () => {
    const s = '<svg><script>alert(1)</script><rect/></svg>';
    expect(sanitizeSvg(s)).not.toMatch(/script/i);
  });
  it('strips inline event handlers', () => {
    const s = '<svg><circle onclick="alert(1)" onmouseover=\'x\' r="2"/></svg>';
    const out = sanitizeSvg(s);
    expect(out).not.toMatch(/onclick/i);
    expect(out).not.toMatch(/onmouseover/i);
    expect(out).toMatch(/r="2"/);
  });
  it('neutralises javascript: URLs', () => {
    const s = '<svg><a href="javascript:alert(1)"><rect/></a></svg>';
    expect(sanitizeSvg(s)).not.toMatch(/javascript:/i);
  });
  it('is safe on empty input', () => {
    expect(sanitizeSvg('')).toBe('');
  });
});
