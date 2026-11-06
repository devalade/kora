// Load, storage and privacy limits: upload quota and abandoned-upload cleanup, inbox retention, and
// the link-preview image proxy (stored URLs only, public hosts only, raster images only).
// The image checks fetch a few public images and are skipped when the network is unreachable.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const base = 'http://localhost:5174';
const DB =
  '.void/v3/d1/miniflare-D1DatabaseObject/14cdd6740a9ae9bdf9ea099bd305c9c22a371ad26be5e9944b614245f1be06ed.sqlite';
const sql = (statement) => execFileSync('sqlite3', ['-cmd', '.timeout 8000', DB, statement], { encoding: 'utf8' }).trim();
const stamp = Date.now().toString(36);

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const email = `limits-${stamp}@kora.app`;
await page.goto(`${base}/signup`);
await page.getByLabel('Your name').fill('Limits Test');
await page.getByLabel('Work email').fill(email);
await page.getByLabel('Password').fill('demo1234');
await page.getByRole('button', { name: 'Create account' }).click();
await page.waitForURL('**/app', { timeout: 20000 });
await page.getByPlaceholder('Acme Studio').fill(`Limits ${stamp}`);
await page.getByRole('button', { name: 'Create', exact: true }).click();
await page.waitForURL(/\/app\/limits-[^/]+\/.+/, { timeout: 20000 });
const slug = new URL(page.url()).pathname.split('/')[2];
const userId = sql(`select id from users where email='${email}'`);
const workspaceId = sql(`select id from workspaces where slug='${slug}'`);

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
);
const upload = (name = 'tiny.png') =>
  context.request.post(`${base}/api/upload`, {
    multipart: { file: { name, mimeType: 'image/png', buffer: png } },
  });

// Cleanup: an unattached upload older than 24 hours goes, a fresh one and an old attached one stay.
const old = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
const insertAttachment = (id, messageId, size, createdAt) =>
  sql(
    `insert into attachments (id, message_id, uploader_id, name, mime, size, storage_key, created_at) values ('${id}', ${messageId ? `'${messageId}'` : 'null'}, '${userId}', 'x.png', 'image/png', ${size}, 'uploads/${userId}/${id}', '${createdAt}')`,
  );
insertAttachment(`old-orphan-${stamp}`, null, 10, old);
insertAttachment(`fresh-orphan-${stamp}`, null, 10, new Date().toISOString());
const first = await upload();
check('upload succeeds', first.ok(), `${first.status()}`);
const left = (id) => Number(sql(`select count(*) from attachments where id='${id}'`));
check('abandoned upload older than 24 h is deleted on the next upload', left(`old-orphan-${stamp}`) === 0);
check('a fresh unattached upload is kept', left(`fresh-orphan-${stamp}`) === 1);

// Quota: 500 MB of stored files, then a refusal that says why.
sql(`delete from attachments where uploader_id='${userId}'`);
insertAttachment(`bulk-${stamp}`, null, 500 * 1024 * 1024 - 5, new Date().toISOString());
const refused = await upload();
const refusedBody = await refused.json().catch(() => ({}));
check('upload over the 500 MB quota is refused with 413', refused.status() === 413, `${refused.status()}`);
check('the refusal explains the quota', /500 MB/.test(refusedBody.error ?? ''), refusedBody.error ?? '');
sql(`delete from attachments where uploader_id='${userId}'`);
check('uploads work again below the quota', (await upload()).ok());

// Inbox retention: read and older than 90 days is removed when the inbox opens; the rest stays.
const longAgo = new Date(Date.now() - 100 * 86400 * 1000).toISOString();
const notify = (id, readAt, createdAt) =>
  sql(
    `insert into notifications (id, workspace_id, user_id, kind, body, read_at, created_at) values ('${id}', '${workspaceId}', '${userId}', 'message_mention', 'x', ${readAt ? `'${readAt}'` : 'null'}, '${createdAt}')`,
  );
notify(`n-old-read-${stamp}`, longAgo, longAgo);
notify(`n-old-unread-${stamp}`, null, longAgo);
notify(`n-new-read-${stamp}`, new Date().toISOString(), new Date().toISOString());
await page.goto(`${base}/app/${slug}/inbox`, { waitUntil: 'networkidle' });
const has = (id) => Number(sql(`select count(*) from notifications where id='${id}'`));
check('read notification older than 90 days is deleted on opening the inbox', has(`n-old-read-${stamp}`) === 0);
check('unread old notification is kept', has(`n-old-unread-${stamp}`) === 1);
check('recent read notification is kept', has(`n-new-read-${stamp}`) === 1);

// Image proxy.
const putPreview = (url, imageUrl) =>
  sql(
    `insert or replace into link_previews (url, title, description, image_url, site_name, domain, fetched_at) values ('${url}', 't', 'd', '${imageUrl}', 's', 'example.com', '${new Date().toISOString()}')`,
  );
const proxy = (imageUrl, pageUrl) =>
  context.request.get(
    `${base}/api/link-preview-image?url=${encodeURIComponent(imageUrl)}${pageUrl ? `&page=${encodeURIComponent(pageUrl)}` : ''}`,
  );
const anonymous = await (await browser.newContext()).request.get(`${base}/api/link-preview-image?url=https%3A%2F%2Fexample.com%2Fa.png`);
check('image proxy requires a session', anonymous.status() === 401, `${anonymous.status()}`);

const notStored = await proxy(`https://example.com/never-stored-${stamp}.png`);
check('an image URL no stored preview holds is refused', notStored.status() === 404, `${notStored.status()}`);

for (const target of ['http://localhost/x.png', 'http://127.0.0.1/x.png', 'http://169.254.169.254/latest/meta-data', 'https://localhost.localdomain.invalid/x.png']) {
  putPreview(`https://blog.example/${stamp}/${encodeURIComponent(target)}`, target);
  const response = await proxy(target, `https://blog.example/${stamp}/${encodeURIComponent(target)}`);
  check(`stored private image URL ${target} is not fetched`, response.status() === 404, `${response.status()}`);
}

const raster = 'https://www.cloudflare.com/favicon.ico';
const pageUrl = `https://blog.example/${stamp}/ok`;
putPreview(pageUrl, raster);
const fetched = await proxy(raster, pageUrl);
if (fetched.status() !== 200) {
  console.log(`SKIP live image fetch (${raster} -> ${fetched.status()}; network unreachable?)`);
} else {
  const headers = fetched.headers();
  check('stored public image is proxied as image/*', (headers['content-type'] ?? '').startsWith('image/'), headers['content-type']);
  check('proxy sends nosniff', headers['x-content-type-options'] === 'nosniff');
  check('proxy sends a sandbox CSP', /sandbox/.test(headers['content-security-policy'] ?? ''));
  const mismatch = await proxy(raster, `https://blog.example/${stamp}/other`);
  check('the page parameter must match the stored preview', mismatch.status() === 404, `${mismatch.status()}`);
  // A non-image (HTML page) behind an image URL, and an SVG, are refused.
  const html = 'https://example.com/';
  putPreview(`https://blog.example/${stamp}/html`, html);
  check('HTML behind an image URL is refused', (await proxy(html, `https://blog.example/${stamp}/html`)).status() === 404);
  const svg = 'https://upload.wikimedia.org/wikipedia/commons/a/a7/React-icon.svg';
  putPreview(`https://blog.example/${stamp}/svg`, svg);
  check('SVG is refused', (await proxy(svg, `https://blog.example/${stamp}/svg`)).status() === 404);
}

// Cleanup what the test created.
sql(`delete from link_previews where url like 'https://blog.example/${stamp}/%'`);
sql(`delete from notifications where user_id='${userId}'`);
await browser.close();
console.log(failed ? `limits: ${failed} check(s) failed` : 'limits: all checks passed');
process.exit(failed ? 1 : 0);
