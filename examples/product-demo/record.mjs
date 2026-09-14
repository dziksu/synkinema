import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import storyboard from './storyboard.json' with { type: 'json' };

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.env.SYNKINEMA_DEMO_OUT || path.join(here, 'out'));
const origin = (process.env.SYNKINEMA_ORIGIN || 'http://127.0.0.1:43817').replace(/\/$/, '');
const holdScale = Number(process.env.SYNKINEMA_DEMO_HOLD_SCALE || '1');
const sourceProjectId = process.env.SYNKINEMA_SOURCE_PROJECT_ID;
const sourceProjectName = process.env.SYNKINEMA_SOURCE_PROJECT_NAME;
const videoClipButton = process.env.SYNKINEMA_VIDEO_CLIP_BUTTON || 'Clip Color atmosphere — bionic-escape';
const captionClipButton = process.env.SYNKINEMA_CAPTION_CLIP_BUTTON || 'Clip Game reveal — bionic';
if (!sourceProjectId) {
  throw new Error('Set SYNKINEMA_SOURCE_PROJECT_ID to an existing project that may be shown read-only.');
}

const rawDir = path.join(out, `raw-${Date.now()}`);
await fs.mkdir(rawDir, { recursive: true });
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

async function hold(ms) {
  await page.waitForTimeout(ms);
}

async function scene(id, action) {
  const item = storyboard.find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown scene ${id}`);
  const startMs = Date.now() - startedAt;
  await action();
  await page.screenshot({ path: path.join(out, `scene-${id}.png`) });
  console.log(`${id.padEnd(12)} ${Math.round(startMs / 1000)}s ${item.title}`);
  await hold(Math.max(0, item.hold_ms * holdScale - (Date.now() - startedAt - startMs)));
  markers.push({ ...item, start_ms: startMs, end_ms: Date.now() - startedAt });
}

try {
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByText('Room for a great story.').waitFor();
  await scene('intro', async () => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  });
  await scene('channels', async () => {
    await page.getByRole('button', { name: 'Channels', exact: true }).click();
    await page.getByText('Loading...', { exact: true }).waitFor({ state: 'hidden' });
  });
  await scene('library', async () => {
    await page.getByRole('button', { name: 'Library', exact: true }).first().click();
    await page.getByText('Library', { exact: true }).last().waitFor();
  });
  await scene('editor', async () => {
    await page.goto(`${origin}/#/projects/${sourceProjectId}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor();
    if (sourceProjectName) await page.getByText(sourceProjectName, { exact: true }).first().waitFor();
  });
  await scene('preview', async () => {
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await play.click();
    await hold(4500);
    const pause = page.getByRole('button', { name: 'Pause', exact: true });
    if (await pause.count()) await pause.click();
  });
  await scene('inspector', async () => {
    await page.getByRole('button', { name: videoClipButton }).click();
  });
  await scene('captions', async () => {
    await page.getByRole('button', { name: captionClipButton }).click();
  });
  await scene('script', async () => {
    await page.getByRole('button', { name: 'Script', exact: true }).click();
  });
  await scene('voice', async () => {
    await page.mouse.move(1000, 650);
    await page.mouse.wheel(0, 650);
    await hold(300);
  });
  await scene('audio', async () => {
    await page.getByRole('button', { name: 'Audio', exact: true }).first().click();
  });
  await scene('exports', async () => {
    await page.getByRole('button', { name: /^Exports\s*\d*/ }).click();
  });
  await scene('history', async () => {
    await page.getByRole('button', { name: 'History', exact: true }).click();
  });
  await scene('queue', async () => {
    await page.getByRole('button', { name: 'Render queue', exact: true }).click();
  });
  await scene('agents', async () => {
    await page.getByRole('button', { name: 'Settings and integrations' }).click();
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
if (recordings.length !== 1) throw new Error(`Expected one WebM recording, found ${recordings.length}`);
await fs.rename(path.join(rawDir, recordings[0]), path.join(out, 'studio-tour.webm'));
await fs.writeFile(path.join(out, 'take.json'), JSON.stringify({
  origin,
  source_project_id: sourceProjectId,
  source_project_name: sourceProjectName,
  captured_at: new Date().toISOString(),
  viewport: { width: 1600, height: 900 },
  scenes: markers,
}, null, 2));
console.log(`Saved ${path.join(out, 'studio-tour.webm')}`);
