// The demo login shown on the home and login pages. Locally that's the seeded account; on
// kora.zecreator.com it's the ZeCreator owner account, kept public on purpose as the live demo.
import { isOriginalSite } from './site';

export const DEMO_EMAIL = import.meta.env.DEV ? 'alade@kora.app' : isOriginalSite() ? 'me@devalade.me' : null;
export const DEMO_PASSWORD = 'demo1234';
