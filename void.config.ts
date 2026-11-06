import { defineConfig } from 'void/config';

const domain = process.env.VITE_KORA_DOMAIN || 'kora.zecreator.com';

export default defineConfig({
  worker: {
    compatibility_date: '2026-02-24',
    compatibility_flags: ['nodejs_compat'],
  },
  // Password reset emails. On deploy, Void sets up Cloudflare Email Sending for the domain;
  // sending to any address (not only verified ones) needs Workers Paid and Email Sending onboarding.
  email: { from: `Kora <noreply@${domain}>` },
  cloudflare: {
    // Server errors and logs in the Cloudflare dashboard (Workers → kora → Logs).
    observability: { enabled: true },
    // Named so `void dev` can route sendEmail() into its local inbox (it loops back through the
    // assets binding). Static assets are served the same way with or without a name.
    assets: { binding: 'ASSETS' },
    routes: [{ pattern: domain, custom_domain: true }],
    // Match the live Worker: its workers.dev address and preview URLs are on.
    workers_dev: true,
    preview_urls: true,
  },
});
