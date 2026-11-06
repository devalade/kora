import { defineEnv, string } from 'void/env';

export default defineEnv({
  KORA_APP_NAME: string().default('Kora'),
  VITE_KORA_DOMAIN: string().default('kora.zecreator.com'),
  VITE_POSTHOG_PROJECT_TOKEN: string().default('phc_waodNqxAHdinHagdTrnpTvwzTfstKZxqNXq924MuQqeq'),
  VITE_POSTHOG_HOST: string().default('https://eu.i.posthog.com'),
  // Optional Cloudflare Realtime TURN credentials for huddles. Set both as Worker secrets
  // (`void secret put`) to enable relayed calls; see README, huddles.
  CF_TURN_KEY_ID: string().optional(),
  CF_TURN_KEY_API_TOKEN: string().optional(),
  // The realtime worker (realtime/): its base URL (https://realtime.<VITE_KORA_DOMAIN> in production,
  // http://localhost:8787 in development) and the secret it shares with the app. See README, realtime.
  REALTIME_URL: string().optional(),
  REALTIME_SECRET: string().optional(),
  // GitHub pull requests (README, GitHub). The GitHub App's URL slug (github.com/apps/<slug>), its
  // OAuth client id and secret (to check that the person installing can see the installation), and
  // the webhook secret GitHub signs deliveries with. All four, or GitHub stays off.
  GITHUB_APP_SLUG: string().optional(),
  GITHUB_CLIENT_ID: string().optional(),
  GITHUB_CLIENT_SECRET: string().optional(),
  GITHUB_WEBHOOK_SECRET: string().optional(),
});
