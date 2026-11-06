import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});

async function login(email, password) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'microphone'],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  const emailField = page.getByLabel('Email');
  const demo = page.getByRole('button', { name: /Try the demo workspace/i });
  for (let attempt = 0; attempt < 30; attempt++) {
    await demo.click({ timeout: 1000 }).catch(() => undefined);
    if ((await emailField.inputValue().catch(() => '')) !== '') break;
    await page.waitForTimeout(250);
  }
  await emailField.fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Your workspaces').waitFor({ timeout: 20000 });
  await page.getByRole('link', { name: /Kora Studio/i }).click();
  await page.waitForURL('**/ch-general', { timeout: 20000 });
  await page.getByRole('textbox', { name: /Message #general/i }).waitFor({ timeout: 20000 });
  return { context, page, errors };
}

const alade = await login('alade@kora.app', 'demo1234');
const amina = await login('amina@kora.app', 'demo1234');

await alade.page.getByRole('button', { name: /Huddle/i }).click();
await alade.page.getByText('Huddle live').first().waitFor({ timeout: 20000 });
await alade.page.waitForTimeout(1500);
await alade.page.screenshot({ path: '/tmp/kora-call-a-alone.png' });

await amina.page.waitForTimeout(2500);
const joinButton = amina.page.getByRole('button', { name: /Join huddle/i }).first();
await joinButton.waitFor({ timeout: 15000 });
await joinButton.click();
await amina.page.getByText('Huddle live').first().waitFor({ timeout: 20000 });
async function waitForRemote(page) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const videos = await page.locator('video').evaluateAll((nodes) =>
      nodes.map((node) => ({
        w: node.videoWidth,
        h: node.videoHeight,
        muted: node.muted,
        ready: node.readyState,
        paused: node.paused,
      })),
    );
    if (videos.some((video) => !video.muted && video.w >= 160 && video.ready >= 2)) return videos;
    await page.waitForTimeout(400);
  }
  return page.locator('video').evaluateAll((nodes) =>
    nodes.map((node) => ({
      w: node.videoWidth,
      h: node.videoHeight,
      muted: node.muted,
      ready: node.readyState,
      paused: node.paused,
    })),
  );
}

const aVideos = await waitForRemote(alade.page);
const bVideos = await waitForRemote(amina.page);

await alade.page.screenshot({ path: '/tmp/kora-call-a.png' });
await amina.page.screenshot({ path: '/tmp/kora-call-b.png' });

await amina.page.getByRole('button', { name: 'Leave', exact: true }).click();
await amina.page.waitForTimeout(2500);
const aAfter = await alade.page.getByText(/in the room/i).innerText();

const countdown = await alade.page.getByText(/\d\d:\d\d left/).first().innerText();
if (!/^0[45]:\d\d left$/.test(countdown)) throw new Error(`expected a 5 minute countdown, got "${countdown}"`);

execFileSync('npx', [
  'void',
  'db',
  'execute',
  "update calls set started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-6 minutes') where channel_id = 'ch-general' and ended_at is null",
]);
await alade.page.getByRole('button', { name: 'Mute', exact: true }).click();
await alade.page.getByText('Huddle live').first().waitFor({ state: 'detached', timeout: 15000 });
await amina.page.getByText('A huddle is live').waitFor({ state: 'detached', timeout: 15000 });
const limitEnded = true;

console.log(
  JSON.stringify(
    {
      aVideos,
      bVideos,
      aAfter,
      countdown,
      limitEnded,
      errors: [...alade.errors, ...amina.errors],
    },
    null,
    2,
  ),
);
await browser.close();
