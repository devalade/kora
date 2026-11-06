import { env } from 'void/env';

export const ORIGINAL_DOMAIN = 'kora.zecreator.com';

export function siteOrigin() {
  return `https://${env.VITE_KORA_DOMAIN}`;
}

export function isOriginalSite() {
  return env.VITE_KORA_DOMAIN === ORIGINAL_DOMAIN;
}
