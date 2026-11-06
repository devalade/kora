import { defineConfig } from 'void/config';

export default defineConfig({
  worker: {
    compatibility_date: '2026-02-24',
    compatibility_flags: ['nodejs_compat'],
  },
  // Password reset emails. On deploy, Void sets up Cloudflare Email Sending for kora.zecreator.com;
  // sending to any address (not only verified ones) needs Workers Paid and Email Sending onboarding.
  email: { from: 'Kora <noreply@kora.zecreator.com>' },
  cloudflare: {
    // Server errors and logs in the Cloudflare dashboard (Workers → kora → Logs).
    observability: { enabled: true },
    // Named so `void dev` can route sendEmail() into its local inbox (it loops back through the
    // assets binding). Static assets are served the same way with or without a name.
    assets: { binding: 'ASSETS' },
    routes: [{ pattern: 'kora.zecreator.com', custom_domain: true }],
    // Match the live Worker: its workers.dev address and preview URLs are on.
    workers_dev: true,
    preview_urls: true,
  },
});
