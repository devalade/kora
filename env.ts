import { defineEnv, string } from 'void/env';

export default defineEnv({
  KORA_APP_NAME: string().default('Kora'),
  // Optional Cloudflare Realtime TURN credentials for huddles. Set both as Worker secrets
  // (`void secret put`) to enable relayed calls; see README, huddles.
  CF_TURN_KEY_ID: string().optional(),
  CF_TURN_KEY_API_TOKEN: string().optional(),
  // The realtime worker (realtime/): its base URL (https://realtime.kora.zecreator.com in production,
  // http://localhost:8787 in development) and the secret it shares with the app. See README, realtime.
  REALTIME_URL: string().optional(),
  REALTIME_SECRET: string().optional(),
});
