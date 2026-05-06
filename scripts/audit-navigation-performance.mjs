#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const DEFAULT_BASE_URL = process.env.POLYPHONIC_AUDIT_URL || 'http://127.0.0.1:5175';
const LONG_TASK_LIMIT_MS = 100;

const thresholds = {
  railWarmStableMs: 250,
  settingsWarmStableMs: 300,
  coldStableMs: 700,
  longTaskMs: LONG_TASK_LIMIT_MS,
};

const railTargets = [
  { label: 'Chat', path: '/chat', aria: 'Open Chat' },
  { label: 'Memory', path: '/memory', aria: 'Open Memory' },
  { label: 'Mind', path: '/mind', aria: 'Open Mind' },
  { label: 'Journal', path: '/journal', aria: 'Open Journal' },
  { label: 'Import', path: '/import', aria: 'Open Import' },
  { label: 'Projects', path: '/projects', aria: 'Open Projects' },
  { label: 'Profile', path: '/profile', aria: 'Open Profile' },
  { label: 'Settings', path: '/settings/agents', aria: 'Open Settings' },
];

const settingsTargets = [
  { label: 'Agents', path: '/settings/agents' },
  { label: 'General', path: '/settings/general' },
  { label: 'Models', path: '/settings/models' },
  { label: 'Appearance', path: '/settings/appearance' },
  { label: 'Skills', path: '/settings/skills' },
  { label: 'Routines', path: '/settings/routines' },
  { label: 'Local runtime', path: '/settings/local-runtime' },
  { label: 'Import & export', path: '/settings/portability' },
  { label: 'Account', path: '/settings/account' },
];

function parseArgs(argv) {
  const args = {
    url: DEFAULT_BASE_URL,
    label: new Date().toISOString().replace(/[:.]/g, '-'),
    out: '',
    headed: false,
    failOnThreshold: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--headed') {
      args.headed = true;
    } else if (arg === '--fail-on-threshold') {
      args.failOnThreshold = true;
    } else if (arg === '--url') {
      args.url = argv[++i] || args.url;
    } else if (arg.startsWith('--url=')) {
      args.url = arg.slice('--url='.length);
    } else if (arg === '--label') {
      args.label = argv[++i] || args.label;
    } else if (arg.startsWith('--label=')) {
      args.label = arg.slice('--label='.length);
    } else if (arg === '--out') {
      args.out = argv[++i] || args.out;
    } else if (arg.startsWith('--out=')) {
      args.out = arg.slice('--out='.length);
    }
  }

  if (!args.out) {
    args.out = path.join('output', 'playwright', `perf-navigation-${args.label}`);
  }

  return args;
}

function absoluteUrl(baseUrl, routePath) {
  return new URL(routePath, baseUrl).toString();
}

async function installObservers(page) {
  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = msg.text();
    if (/Download the React DevTools/i.test(text)) return;
    if (/WebSocket connection to .*supabase\.co\/realtime\/v1\/websocket.*closed before the connection is established/i.test(text)) return;
    page.__auditConsole.push({ type, text });
  });

  page.on('pageerror', (error) => {
    page.__auditConsole.push({ type: 'pageerror', text: error.message });
  });

  await page.addInitScript(() => {
    window.__navLongTasks = [];
    window.__navFallbackFrames = [];
    window.__navAppShellMissingFrames = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__navLongTasks.push({
            name: entry.name,
            startTime: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
          });
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      window.__navLongTaskUnsupported = true;
    }
  });
}

async function preparePage(context, baseUrl, viewportName) {
  const page = await context.newPage();
  page.__auditConsole = [];
  await installObservers(page);
  await page.goto(absoluteUrl(baseUrl, '/auth/login'), { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page, baseUrl, viewportName);
  return page;
}

async function loginIfNeeded(page, baseUrl, viewportName) {
  const email = process.env.POLYPHONIC_TEST_EMAIL;
  const password = process.env.POLYPHONIC_TEST_PASSWORD;

  if (!/\/auth\/login/.test(page.url())) {
    return;
  }

  if (!email || !password) {
    return;
  }

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: 20000 }).catch(() => null),
    page.getByRole('button', { name: /^Sign in$/i }).click(),
  ]);

  await page.waitForLoadState('domcontentloaded');
  await waitForStable(page, `${viewportName}:login`, 10000);
}

async function waitForStable(page, label, timeout = 7000) {
  await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => null);
  await page.waitForFunction(() => document.readyState !== 'loading', null, { timeout }).catch(() => null);
  await page.waitForFunction(() => !document.querySelector('[aria-label="Loading page"]'), null, { timeout }).catch(() => null);
  await page.waitForFunction(() => Boolean(document.querySelector('.app-shell') || document.querySelector('form')), null, { timeout }).catch(() => null);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(80);
}

async function sampleFallbackDuring(page, trigger) {
  return page.evaluate(async () => {
    window.__navFallbackFrames = [];
    window.__navAppShellMissingFrames = [];
    const start = performance.now();
    while (performance.now() - start < 850) {
      if (document.querySelector('[aria-label="Loading page"]')) {
        window.__navFallbackFrames.push(Math.round(performance.now() - start));
      }
      if (!document.querySelector('.app-shell')) {
        window.__navAppShellMissingFrames.push(Math.round(performance.now() - start));
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return {
      sampled: true,
      fallbackFrames: window.__navFallbackFrames.length,
      appShellMissingFrames: window.__navAppShellMissingFrames.length,
    };
  }).catch(() => ({ sampled: false, fallbackFrames: null, appShellMissingFrames: null, trigger }));
}

async function measureNavigation(page, target, options) {
  const { baseUrl, kind, thresholdMs } = options;
  const beforeConsole = page.__auditConsole.length;
  const beforeLongTasks = await page.evaluate(() => window.__navLongTasks?.length || 0);
  const start = Date.now();

  let interaction = 'click';
  let action;

  if (kind === 'rail' && target.aria) {
    const control = page.getByLabel(target.aria).first();
    const count = await control.count();
    if (count > 0) {
      action = () => control.click();
    }
  }

  if (!action && kind === 'settings') {
    const control = page.getByRole('button', { name: target.label }).first();
    const count = await control.count();
    if (count > 0) {
      action = () => control.click();
    }
  }

  if (!action) {
    interaction = 'url-fallback';
    action = () => page.goto(absoluteUrl(baseUrl, target.path), { waitUntil: 'domcontentloaded' });
  }

  const samplePromise = interaction === 'click'
    ? sampleFallbackDuring(page, target.label)
    : Promise.resolve({ sampled: false, fallbackFrames: null, appShellMissingFrames: null });
  await action();
  await page.waitForURL((url) => url.pathname === target.path || url.pathname.startsWith(`${target.path}/`), { timeout: 10000 }).catch(() => null);
  await waitForStable(page, target.label);
  const end = Date.now();
  const sample = await samplePromise;
  const longTasks = await page.evaluate((index) => (window.__navLongTasks || []).slice(index), beforeLongTasks);
  const consoleItems = page.__auditConsole.slice(beforeConsole);
  const maxLongTaskMs = longTasks.reduce((max, entry) => Math.max(max, entry.duration || 0), 0);
  const stableMs = Math.round(end - start);

  return {
    label: target.label,
    path: target.path,
    interaction,
    stableMs,
    thresholdMs,
    passStable: stableMs <= thresholdMs,
    maxLongTaskMs,
    passLongTasks: maxLongTaskMs <= LONG_TASK_LIMIT_MS,
    longTaskCount: longTasks.length,
    consoleCount: consoleItems.length,
    consoleItems,
    fallbackFrames: sample.fallbackFrames,
    appShellMissingFrames: sample.appShellMissingFrames,
    fallbackSampled: sample.sampled,
    passNoFullScreenFallback: !sample.sampled || (sample.fallbackFrames === 0 && sample.appShellMissingFrames === 0),
  };
}

async function runRailSweep(page, baseUrl) {
  await page.goto(absoluteUrl(baseUrl, '/chat'), { waitUntil: 'domcontentloaded' });
  await waitForStable(page, 'rail-warmup');
  const results = [];
  for (const target of railTargets) {
    results.push(await measureNavigation(page, target, {
      baseUrl,
      kind: 'rail',
      thresholdMs: thresholds.railWarmStableMs,
    }));
  }
  return results;
}

async function runSettingsSweep(page, baseUrl) {
  await page.goto(absoluteUrl(baseUrl, '/settings/agents'), { waitUntil: 'domcontentloaded' });
  await waitForStable(page, 'settings-warmup');
  const results = [];
  for (const target of settingsTargets) {
    results.push(await measureNavigation(page, target, {
      baseUrl,
      kind: 'settings',
      thresholdMs: thresholds.settingsWarmStableMs,
    }));
  }
  return results;
}

function summarizeFailures(section, results) {
  return results.flatMap((result) => {
    const failures = [];
    if (!result.passStable) failures.push(`${section}:${result.label}: stable ${result.stableMs}ms > ${result.thresholdMs}ms`);
    if (!result.passLongTasks) failures.push(`${section}:${result.label}: long task ${result.maxLongTaskMs}ms > ${LONG_TASK_LIMIT_MS}ms`);
    if (result.consoleCount > 0) failures.push(`${section}:${result.label}: ${result.consoleCount} console warning/error(s)`);
    if (!result.passNoFullScreenFallback) failures.push(`${section}:${result.label}: fallback frames ${result.fallbackFrames}, missing shell frames ${result.appShellMissingFrames}`);
    return failures;
  });
}

async function runViewport(browser, args, viewport) {
  const context = await browser.newContext({
    viewport: viewport.size,
    deviceScaleFactor: viewport.deviceScaleFactor || 1,
    isMobile: viewport.isMobile || false,
    hasTouch: viewport.isMobile || false,
  });
  const page = await preparePage(context, args.url, viewport.name);
  const result = {
    viewport: viewport.name,
    size: viewport.size,
    authenticated: !/\/auth\/login/.test(page.url()),
    rail: [],
    settings: [],
    consoleAtEnd: [],
    screenshot: path.join(args.out, `${viewport.name}.png`),
  };

  if (result.authenticated) {
    result.rail = await runRailSweep(page, args.url);
    result.settings = await runSettingsSweep(page, args.url);
  }

  result.consoleAtEnd = page.__auditConsole;
  await page.screenshot({ path: result.screenshot, fullPage: true }).catch(() => null);
  await context.close();
  return result;
}

function printTable(title, results) {
  console.log(`\n${title}`);
  for (const item of results) {
    const marker = item.passStable && item.passLongTasks && item.consoleCount === 0 && item.passNoFullScreenFallback ? '✓' : '!';
    const fallback = item.fallbackSampled ? `${item.fallbackFrames}/${item.appShellMissingFrames}` : 'n/a';
    console.log(`${marker} ${item.label.padEnd(16)} ${String(item.stableMs).padStart(4)}ms  long:${String(item.maxLongTaskMs).padStart(3)}ms  console:${item.consoleCount}  fallback:${fallback}  via:${item.interaction}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  await mkdir(args.out, { recursive: true });

  const browser = await chromium.launch({ headless: !args.headed });
  const report = {
    label: args.label,
    baseUrl: args.url,
    generatedAt: new Date().toISOString(),
    thresholds,
    desktop: await runViewport(browser, args, {
      name: 'desktop-1440x900',
      size: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    }),
    mobile: await runViewport(browser, args, {
      name: 'mobile-390x844',
      size: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
    }),
  };

  await browser.close();

  report.failures = [
    ...summarizeFailures('desktop:rail', report.desktop.rail),
    ...summarizeFailures('desktop:settings', report.desktop.settings),
    ...summarizeFailures('mobile:rail', report.mobile.rail),
    ...summarizeFailures('mobile:settings', report.mobile.settings),
  ];

  const jsonPath = path.join(args.out, 'navigation-audit.json');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Navigation audit written to ${jsonPath}`);
  if (!report.desktop.authenticated || !report.mobile.authenticated) {
    console.log('Not authenticated in at least one viewport. Set POLYPHONIC_TEST_EMAIL and POLYPHONIC_TEST_PASSWORD for full app sweeps.');
  }
  printTable('Desktop rail', report.desktop.rail);
  printTable('Desktop settings', report.desktop.settings);
  printTable('Mobile rail', report.mobile.rail);
  printTable('Mobile settings', report.mobile.settings);

  if (report.failures.length > 0) {
    console.log('\nThreshold findings');
    for (const failure of report.failures) console.log(`- ${failure}`);
  }

  if (args.failOnThreshold && report.failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
