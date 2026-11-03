# Kora

Kora is a Slack-style team chat app built with Void and TanStack Start on Cloudflare. It has
workspaces, channels, direct messages, threads, reactions, file attachments, search, presence, and
one-click video huddles.

The app runs locally with one command and deploys to a Cloudflare account with Void. The production
target is D1 for relational data, R2 for files, and Workers for every request.

## Demo

The seed creates a workspace called **Kora Studio** with four teammates and a few days of
conversation.

| Email | Password |
| --- | --- |
| `alade@kora.app` | `demo1234` |
| `amina@kora.app` | `demo1234` |
| `kwame@kora.app` | `demo1234` |
| `zane@kora.app` | `demo1234` |

Open two browser windows with different accounts to see messages, typing indicators, presence, and
huddles move between them.

## Features

- Workspaces with invite codes, public channels, private channels, and direct messages
- Message threads with reply counts that update live
- Emoji reactions, mentions, channel links, and seeded demo conversations
- File and image uploads stored in R2, served through an authenticated route
- Workspace search across every channel the signed-in user can see
- Presence, typing indicators, unread badges, and per-channel read state
- One-click huddles with camera, microphone, screen share, mute, and a participant grid
- Email and password accounts with hashed passwords and HttpOnly sessions
- Responsive app shell with a mobile navigation drawer

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Void 1.1 with TanStack Start |
| UI | React 19, TanStack Router, Tailwind CSS 4, Lucide icons |
| Database | Cloudflare D1 with Drizzle ORM |
| Files | Cloudflare R2 through `void/storage` |
| Runtime | Cloudflare Workers |
| Video | WebRTC peer-to-peer mesh with STUN |
| Signaling | D1-backed offer, answer, and ICE queues polled every 900 ms |
| Realtime | Server function polling every 2 seconds plus immediate refresh after writes |

## Run locally

Requirements: Node.js 20 or newer, npm, and a Cloudflare account only when you deploy.

```bash
npm install
npx void db seed
npm run dev
```

Vite prints the local URL. The seed command resets the local D1 database, applies migrations, and
loads the demo workspace.

Useful commands:

```bash
npm run typecheck        # TypeScript
npm run build           # production build
npx void db generate    # generate a migration after schema changes
npx void db migrate     # apply pending migrations
npx void db seed        # reset and reseed the demo data
```

## Architecture

```text
app/
  routes/               TanStack Start pages and API routes
  components/           App shell, messages, composer, calls, dialogs
  lib/                  Server functions, session handling, formatting, types
db/
  schema.ts             D1 schema
  seed.ts               Demo workspace and conversations
  migrations/           Generated SQL migrations
```

Server state lives in `db/schema.ts`. The main tables are users, sessions, workspaces,
workspace members, channels, channel members, messages, reactions, attachments, calls, call
participants, and call signals.

Every server function checks the session and channel membership before reading or writing. File URLs
are authenticated and checked against the channel that owns the message.

### How huddles work

Each browser opens its camera and microphone with `getUserMedia`. Participants poll the active call
and the signaling inbox. The participant with the lexicographically smaller user id creates the
WebRTC offer, the other side answers, and ICE candidates are exchanged through D1. Audio and video
flow directly between browsers.

The default configuration uses Cloudflare and Google STUN servers. A production deployment behind
restrictive NATs should add a TURN service. Put its credentials in the environment and the call room
will include them automatically:

```bash
VITE_TURN_URL=turn:turn.example.com:3478
VITE_TURN_USERNAME=...
VITE_TURN_CREDENTIAL=...
```

Set those keys in your shell or in the deployment environment before building.

Polling is deliberate. Void typed WebSocket routes are not available in meta-framework mode, so the
app uses server functions and cheap polling to stay compatible with TanStack Start. The seams are
isolated: `workspaceSnapshotFn` for chat state and `pollCallSignalsFn` for calls. They can be
replaced with Durable Objects or a dedicated realtime service without changing the UI.

## Verification

Three Playwright scripts cover the main paths. Start the dev server, then run:

```bash
node scripts/smoke.mjs    # sign in, send a message, open a thread, search
node scripts/upload.mjs   # upload an image and render it from R2
node scripts/call.mjs     # two accounts join a huddle and exchange video
```

They expect the app at `http://localhost:5174`. Change the `base` constant if Vite picks another
port. The call script uses Chromium's fake media devices.

## Deploy

Deployment is not included in this repository. To ship it to your own Cloudflare account:

```bash
npx void auth login
npx void deploy --platform cloudflare
```

Void provisions D1 and R2 bindings when needed. After the first deploy, run the migrations against
the remote database with your normal Void or Wrangler workflow, then create an account or load demo
data.

## Known limits

- Realtime chat uses polling, not WebSockets or Durable Objects.
- Huddles are a peer-to-peer mesh, best for small rooms of two to four people.
- There is no TURN service configured, so some restrictive networks will fail to connect calls.
- Email invites, push notifications, message editing, and message deletion are not built yet.
- Search uses `LIKE` and is intended for small teams, not large message archives.

## License

MIT
