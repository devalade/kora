// The demo login shown on the home and login pages. Locally that's the seeded account; in
// production it's the ZeCreator owner account, kept public on purpose as the live demo.
export const DEMO_EMAIL = import.meta.env.DEV ? 'alade@kora.app' : 'me@devalade.me';
export const DEMO_PASSWORD = 'demo1234';
