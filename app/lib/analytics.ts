// Product analytics and client error reporting with PostHog. Client only; it does nothing without
// VITE_POSTHOG_PROJECT_TOKEN (env.ts), and it never runs in local development unless VITE_POSTHOG_DEV is set.
//
// Chat is private, so the setup is deliberately quiet: no session recording, every autocaptured
// element's text and attributes are masked, and people are identified by their Kora id only (no
// name or email is sent).

import type { PostHog } from 'posthog-js';
import { env } from 'void/env';
import { isOriginalSite } from './site';

type Identity = { id: string } | null | undefined;

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
let identifiedAs: string | null = null;

function enabled() {
  if (typeof window === 'undefined') return false;
  if (!env.VITE_POSTHOG_PROJECT_TOKEN) return false;
  if (!isOriginalSite() && !import.meta.env.VITE_POSTHOG_PROJECT_TOKEN) return false;
  return !import.meta.env.DEV || Boolean(import.meta.env.VITE_POSTHOG_DEV);
}

function load(): Promise<PostHog | null> {
  if (!enabled()) return Promise.resolve(null);
  loading ??= import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(env.VITE_POSTHOG_PROJECT_TOKEN, {
        api_host: env.VITE_POSTHOG_HOST,
        person_profiles: 'identified_only',
        capture_pageview: 'history_change',
        capture_exceptions: true,
        disable_session_recording: true,
        mask_all_text: true,
        mask_all_element_attributes: true,
      });
      client = posthog;
      return posthog;
    })
    .catch(() => null);
  return loading;
}

/** Called by the root route with the signed-in person (or null when signed out). */
export function startAnalytics(user: Identity) {
  void load().then((posthog) => {
    if (!posthog) return;
    if (user && identifiedAs !== user.id) {
      posthog.identify(user.id);
      identifiedAs = user.id;
    } else if (!user && identifiedAs) {
      posthog.reset();
      identifiedAs = null;
    }
  });
}

/** Errors caught by an error boundary never reach the global handler, so they are sent here. */
export function captureError(error: unknown) {
  if (!enabled()) return;
  void load().then((posthog) => posthog?.captureException(error));
}

/** A named product event, for the few moments worth counting (sign up, first message, and so on). */
export function track(event: string, properties?: Record<string, string | number | boolean>) {
  if (client) client.capture(event, properties);
  else if (enabled()) void load().then((posthog) => posthog?.capture(event, properties));
}
