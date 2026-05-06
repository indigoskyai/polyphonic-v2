import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function walkFiles(dir: string): string[] {
  const root = join(process.cwd(), dir);
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relPath = `${dir}/${entry.name}`;
    const absPath = join(process.cwd(), relPath);
    if (entry.isDirectory()) {
      if (entry.name === 'test') return [];
      return walkFiles(relPath);
    }
    return statSync(absPath).isFile() ? [relPath] : [];
  });
}

describe('launch readiness static gates', () => {
  it('keeps client source free of service-role key references', () => {
    const scannedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
    const offenders = walkFiles('src')
      .filter((path) => scannedExtensions.has(extname(path)))
      .filter((path) => /SERVICE_ROLE|SUPABASE_SERVICE_ROLE|service_role/i.test(readRepoFile(path)));

    expect(offenders).toEqual([]);
  });

  it('keeps browser CORS explicit and production-scoped', () => {
    const cors = readRepoFile('supabase/functions/_shared/cors.ts');

    expect(cors).toContain('"https://polyphonic.chat"');
    expect(cors).toContain('"https://www.polyphonic.chat"');
    expect(cors).toContain('"https://polyphonic-v2.lovable.app"');
    expect(cors).toContain('LOVABLE_PREVIEW_ORIGIN');
    expect(cors).toContain('!IS_PROD && LOCAL_DEV_ORIGIN.test(origin)');
    expect(cors).not.toContain('"Access-Control-Allow-Origin": "*"');
    expect(cors).not.toContain("'Access-Control-Allow-Origin': '*'");
  });

  it('publishes release metadata, social tags, robots, and a web manifest', () => {
    const index = readRepoFile('index.html');
    const robots = readRepoFile('public/robots.txt');
    const manifest = JSON.parse(readRepoFile('public/site.webmanifest')) as {
      name?: string;
      start_url?: string;
      display?: string;
      icons?: Array<{ src?: string; sizes?: string; type?: string }>;
    };

    expect(index).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(index).toContain('<link rel="canonical" href="https://polyphonic.chat/" />');
    expect(index).toContain('<meta property="og:image" content="https://polyphonic.chat/favicon.png" />');
    expect(index).toContain('<meta name="twitter:image" content="https://polyphonic.chat/favicon.png" />');
    expect(index).toContain('<meta name="theme-color" content="#08080a" />');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://polyphonic.chat/sitemap.xml');
    expect(existsSync(join(process.cwd(), 'public/sitemap.xml'))).toBe(true);
    expect(manifest.name).toBe('Polyphonic');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons?.some((icon) => icon.src === '/favicon.svg' && icon.sizes === 'any')).toBe(true);
  });
});
