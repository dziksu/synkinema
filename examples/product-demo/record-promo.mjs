import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import storyboard from './storyboard-promo.json' with { type: 'json' };

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.env.SYNKINEMA_DEMO_OUT || path.join(here, 'out-promo-v3'));
const origin = (process.env.SYNKINEMA_ORIGIN || 'http://127.0.0.1:43817').replace(/\/$/, '');
const sourceProjectId = process.env.SYNKINEMA_SOURCE_PROJECT_ID;
const videoClipButton = process.env.SYNKINEMA_VIDEO_CLIP_BUTTON || 'Clip Color atmosphere — bionic-escape';
const captionClipButton = process.env.SYNKINEMA_CAPTION_CLIP_BUTTON || 'Clip Game reveal — bionic';
if (!sourceProjectId) throw new Error('Set SYNKINEMA_SOURCE_PROJECT_ID to a project that may be shown read-only.');

await fs.mkdir(out, { recursive: true });
const rawDir = path.join(out, `raw-${Date.now()}`);
await fs.mkdir(rawDir);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  recordVideo: { dir: rawDir, size: { width: 1600, height: 900 } },
});
const page = await context.newPage();
const startedAt = Date.now();
const markers = [];
const pause = (ms) => page.waitForTimeout(ms);

async function scene(id, action) {
  const item = storyboard.find((part) => part.id === id);
  if (!item) throw new Error(`Unknown scene: ${id}`);
  const startMs = Date.now() - startedAt;
  await action();
  await page.screenshot({ path: path.join(out, `scene-${id}.png`) });
  await pause(Math.max(0, item.hold_ms - (Date.now() - startedAt - startMs)));
  const endMs = Date.now() - startedAt;
  markers.push({ ...item, start_ms: startMs, end_ms: endMs });
  console.log(`${id.padEnd(10)} ${(endMs / 1000).toFixed(1)}s ${item.title}`);
}

try {
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByText('Room for a great story.').waitFor();
  await scene('hook', async () => {
    await page.getByRole('button', { name: 'Settings and integrations' }).click();
    await pause(1600);
    await page.goto(`${origin}/#/projects/${sourceProjectId}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
    await page.getByRole('button', { name: videoClipButton }).click();
  });
  await scene('channels', async () => {
    await page.getByRole('button', { name: 'Channels', exact: true }).click();
    await page.getByPlaceholder('Search channels').fill('Spawn');
    await pause(500);
    await page.getByPlaceholder('Search channels').fill('');
  });
  await scene('library', async () => {
    await page.getByRole('button', { name: 'Library', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Search media' }).fill('music');
    await pause(650);
    await page.getByRole('textbox', { name: 'Search media' }).fill('');
    await page.getByText('Videos', { exact: true }).first().click();
  });
  await scene('timeline', async () => {
    await page.goto(`${origin}/#/projects/${sourceProjectId}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await pause(1500);
    const pauseButton = page.getByRole('button', { name: 'Pause', exact: true });
    if (await pauseButton.count()) await pauseButton.click();
  });
  await scene('design', async () => {
    await page.getByRole('button', { name: videoClipButton }).click();
    await pause(1000);
    await page.getByRole('button', { name: captionClipButton }).click();
  });
  await scene('story', async () => {
    await page.getByRole('button', { name: 'Script', exact: true }).click();
    await pause(650);
    await page.mouse.move(1050, 670);
    await page.mouse.wheel(0, 620);
  });
  await scene('audio', async () => {
    await page.getByRole('button', { name: 'Audio', exact: true }).first().click();
    await pause(500);
    await page.mouse.move(920, 720);
    await page.mouse.wheel(0, 440);
  });
  await scene('export', async () => {
    await page.getByRole('button', { name: /^Exports\s*\d*/ }).click();
    await pause(550);
    await page.mouse.move(1220, 700);
    await page.mouse.wheel(0, 380);
  });
  await scene('history', async () => {
    await page.getByRole('button', { name: 'History', exact: true }).click();
    await pause(550);
    await page.mouse.move(900, 700);
    await page.mouse.wheel(0, 420);
  });
  await scene('agents', async () => {
    await page.getByRole('button', { name: 'Settings and integrations' }).click();
    await page.getByRole('button', { name: 'Claude Code', exact: true }).click();
    await pause(650);
    await page.getByRole('button', { name: 'Codex', exact: true }).click();
  });
  await scene('outro', async () => {
    await page.getByRole('button', { name: 'Projects', exact: true }).first().click();
    await page.getByText('Room for a great story.').waitFor();
  });
} finally {
  await context.close();
  await browser.close();
}

const recordings = (await fs.readdir(rawDir)).filter((name) => name.endsWith('.webm'));
if (recordings.length !== 1) throw new Error(`Expected one recording, found ${recordings.length}`);
await fs.rename(path.join(rawDir, recordings[0]), path.join(out, 'studio-tour.webm'));
await fs.writeFile(path.join(out, 'take.json'), JSON.stringify({
  origin,
  source_project_id: sourceProjectId,
  captured_at: new Date().toISOString(),
  viewport: { width: 1600, height: 900 },
  scenes: markers,
}, null, 2));
console.log(`Saved ${path.join(out, 'studio-tour.webm')}`);
