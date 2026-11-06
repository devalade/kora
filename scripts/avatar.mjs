// Profile photos: upload through the profile dialog, see it as a teammate, check who may load it,
// then remove it and check the initials come back.
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const browser = await chromium.launch();
const errors = [];

async function signIn(email, password = 'demo1234') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${email}: ${error.message.split('\n')[0]}`));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/app');
  return page;
}

// A real 900x600 image, made by screenshotting a gradient, to exercise the square crop.
const maker = await browser.newPage({ viewport: { width: 900, height: 600 } });
await maker.setContent('<body style="margin:0;background:linear-gradient(135deg,#ef5f3e,#17795f)"></body>');
const photo = await maker.screenshot({ type: 'png' });
await maker.close();

const alade = await signIn('alade@kora.app');
await alade.goto(`${base}/app/kora-studio/ch-general`, { waitUntil: 'networkidle' });
await alade.getByRole('button', { name: 'Open profile' }).click();
const dialog = alade.getByRole('dialog', { name: 'Your profile' });
await dialog.getByLabel('Choose a profile photo').setInputFiles({
  name: 'me.png',
  mimeType: 'image/png',
  buffer: photo,
});
await alade.getByText('Photo updated.').waitFor({ timeout: 15000 });
const src = await dialog.locator('img').first().getAttribute('src');
const uploaded = Boolean(src && src.startsWith('/api/avatars/u-alade?v='));
const size = await dialog.locator('img').first().evaluate(async (img) => {
  await img.decode().catch(() => undefined);
  return { width: img.naturalWidth, height: img.naturalHeight };
});
await alade.keyboard.press('Escape');

// A teammate sees the photo on Alade's messages.
const amina = await signIn('amina@kora.app');
await amina.goto(`${base}/app/kora-studio/ch-general`, { waitUntil: 'networkidle' });
await amina.waitForTimeout(2500);
const seenByTeammate = await amina
  .locator(`img[src="${src}"]`)
  .first()
  .evaluate(async (img) => {
    await img.decode().catch(() => undefined);
    return img.naturalWidth > 0;
  })
  .catch(() => false);

// Who may load it: signed out gets 401; someone who shares no workspace gets 404.
const anonymous = await (await browser.newContext()).request.get(`${base}${src}`);
const stamp = Date.now().toString(36);
const strangerContext = await browser.newContext();
const stranger = await strangerContext.newPage();
await stranger.goto(`${base}/signup`, { waitUntil: 'networkidle' });
await stranger.getByLabel('Your name').fill('Stranger');
await stranger.getByLabel('Work email').fill(`stranger-${stamp}@kora.app`);
await stranger.getByLabel('Password').fill('demo1234');
await stranger.getByRole('button', { name: 'Create account' }).click();
await stranger.waitForURL('**/app');
const strangerResponse = await strangerContext.request.get(`${base}${src}`);

// Remove: initials come back and the old URL stops working.
await alade.getByRole('button', { name: 'Open profile' }).click();
await alade.getByRole('dialog', { name: 'Your profile' }).getByRole('button', { name: 'Remove' }).click();
await alade.getByText('Photo removed.').waitFor({ timeout: 10000 });
const initialsBack = (await alade.getByRole('dialog', { name: 'Your profile' }).locator('img').count()) === 0;
const oldUrl = await alade.context().request.get(`${base}${src}`);

const result = {
  uploaded,
  croppedSquare: size.width === size.height && size.width <= 256,
  seenByTeammate,
  anonymousStatus: anonymous.status(),
  strangerStatus: strangerResponse.status(),
  initialsBack,
  oldUrlStatus: oldUrl.status(),
  errors,
};
console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(
  result.uploaded &&
    result.croppedSquare &&
    result.seenByTeammate &&
    result.anonymousStatus === 401 &&
    result.strangerStatus === 404 &&
    result.initialsBack &&
    result.oldUrlStatus === 404 &&
    errors.length === 0
    ? 0
    : 1,
);
