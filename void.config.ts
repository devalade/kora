import { defineConfig } from 'void/config';

export default defineConfig({
  worker: {
    compatibility_date: '2026-02-24',
    compatibility_flags: ['nodejs_compat'],
  },
  cloudflare: {
    routes: [{ pattern: 'kora.zecreator.com', custom_domain: true }],
    // Match the live Worker: its workers.dev address and preview URLs are on.
    workers_dev: true,
    preview_urls: true,
  },
});
