# Kora

Live: https://kora.zecreator.com

Kora is a Slack-style team chat app built with Void and TanStack Start on Cloudflare. It has
workspaces, channels, direct messages, threads, reactions, file attachments, search, presence,
video huddles, and a full task workflow.

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
| `elon@kora.app` | `demo1234` |

Open two browser windows with different accounts to see messages, typing indicators, presence, and
huddles move between them.

## Features

- One navigation rail on every page, always in the same order: Inbox, Chat, Tasks, Studio
- An Inbox of what happened to you: assignments, comments and status changes on issues you follow, mentions, and thread replies
- Workspaces with invite codes, public channels, private channels, and direct messages
- Message threads with reply counts that update live
- @mention autocomplete for workspace teammates, with mention badges in the sidebar
- Markdown messages with bold, italic, strikethrough, inline code, code blocks, lists, quotes, and links
- Link previews that unfurl the page title, description, site name, and Open Graph image; images load through an authenticated proxy so linked sites never see your readers
- Issue references: type `#` in chat to pick an issue; `KOR-12` renders as a live chip, a key on its own line as an embed card, and the issue's history shows where it was mentioned
- Emoji reactions, channel links, and seeded demo conversations
- File and image uploads with live progress, thumbnail previews, and a fullscreen image lightbox
- Workspace search across every channel the signed-in user can see, with arrow-key and Enter navigation
- Presence, typing indicators, unread badges, and per-channel read state
- One-click huddles with camera, microphone, screen share, mute, and a participant grid
- Studio virtual office with rooms, live presence, activity feed, and room huddles
- Linear-style tasks with a virtualized list, board, full issue pages, a New issue modal (press C anywhere), comments, optimistic updates, and keyboard navigation
- Teams own the issue key (KOR-12) and every issue belongs to one team; Projects group issues from any team with a status, lead, target date and progress
- An issue history line: every change (status, priority, assignee, labels, project, parent, dates, title) is recorded and shown between comments
- Searchable property pickers with number shortcuts, a label multi-select that can create labels, and a parent-issue picker
- Sub-issues are ordinary issues: attach any existing issue, change or clear its parent, or detach it
- A live Markdown editor with clickable task lists and checklist progress in the editor, list, and board
- Collapsible status groups and drag-and-drop status changes in both the list and board views
- Timeline view with start and due dates, month and day rails, and unscheduled issues
- Sub-issue progress in the issue, list, and board
- A label manager for renaming, recoloring, adding, and removing workspace labels
- Live editor presence and cross-user issue updates while an issue is open
- Quick-add rows for new issues and inline label creation, both with Enter to submit
- A workspace workflow editor for adding, renaming, recoloring, reordering, and deleting custom statuses
- Email and password accounts with hashed passwords and HttpOnly sessions, sign-in rate limits, session
  rotation, and "Sign out of all devices"
- Roles: owners and admins manage the workflow, labels and teams and can delete anything; members
  create and edit work and delete only the issues they created. The owner changes roles in
  Members & roles
- Deleted issues go to a Trash for 30 days and can be restored (Undo on delete, or from Trash)
- Two people editing one description never overwrite each other: the later save is flagged as a
  conflict and the editor chooses which text to keep
- Profile photos, cropped and resized in the browser, visible only to people who share a workspace
- Typing dots on sidebar channels and DMs, avatars on the typing line, and "Amina is editing the
  description" on an issue
- Markdown comments that format as you type (headings, bold, code, lists, `- [ ]` checklists), posted
  with ⌘↵ and shown formatted with issue chips
- (Off for now) GitHub pull requests linked to issues by branch name, title or `Fixes KOR-12`, with PR state and
  reviews on the issue, a PR badge in lists, and issues that move forward as the PR moves
- "Copy git branch name" on every issue (⌘⇧.)
- An MCP server for AI agents: personal tokens in Profile → AI agents, eight tools for reading,
  creating, updating and commenting on issues, all recorded as the token's owner
- Edit and delete messages (admins can delete anyone's), copy a link to any message or reply, and a
  searchable emoji picker for reactions and the composer
- Paste or drop files anywhere on the channel to attach them, with the 25 MB limit checked before
  upload; unsent text is kept per channel and thread
- A "New" line at the first unread message, a jump-to-latest button, and unread DMs and mentions in
  the tab title
- Desktop notifications for DMs and mentions (Profile → Desktop notifications)
- Rename, mute and leave channels; rename and leave workspaces; reset the invite link; remove members
- Forgot password by email, reset links that work once for an hour, and change password in Profile
- Rate limits on messages, uploads, issues, comments, channels and workspaces (MCP included)
- 404 and error pages, Terms and Privacy, Open Graph tags, robots.txt and a sitemap
- `?` opens a keyboard shortcut sheet
- PostHog analytics and client error reporting when `VITE_POSTHOG_PROJECT_TOKEN` is set (no session
  recording, text masked); server logs in Workers observability
- Responsive app shell with a mobile navigation drawer

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Void 1.1 with TanStack Start |
| UI | React 19, TanStack Router, TanStack Virtual, Tailwind CSS 4, Lucide icons |
| Database | Cloudflare D1 with Drizzle ORM |
| Files | Cloudflare R2 through `void/storage` |
| Runtime | Cloudflare Workers |
| Video | WebRTC peer-to-peer mesh with STUN |
| Signaling | D1-backed offer, answer, and ICE queues, fetched the moment a push says one is waiting |
| Realtime | WebSockets on a companion Worker (`realtime/`) with one Durable Object per workspace; no polling |

## Run locally

Requirements: Node.js 20 or newer, npm, and a Cloudflare account only when you deploy.

```bash
npm install
npx void db seed
npm run dev
```

`npm run dev` starts the app (Vite) and the realtime worker (`wrangler dev` on port 8787) together.
Realtime needs two values in `.env`, the same secret on both sides:

```bash
# .env (the app)
REALTIME_URL=http://localhost:8787
REALTIME_SECRET=<any long random string>

# realtime/.dev.vars (the worker)
REALTIME_SECRET=<the same string>
APP_ORIGIN=http://localhost:5174
```

Without them the app still works, but other people's changes only show when you return to the tab.

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
participants, and call signals. Tasks use teams (which own the issue key), projects, issues,
issue labels, issue comments, issue events (the history line), and notifications (the inbox).

Issue references are stored as plain text (`KOR-12`) and resolved when messages are read, so they
stay readable anywhere and their status is always current. History and inbox rows are written by
the helpers in `app/lib/activity.ts`.

Every server function checks the session and channel membership before reading or writing. File URLs
are authenticated and checked against the channel that owns the message.

### How huddles work

Each browser opens its camera and microphone with `getUserMedia`. Offers, answers and ICE candidates
are queued in D1, and the recipient fetches them the moment the realtime socket says one is waiting. The participant with the lexicographically smaller user id creates the
WebRTC offer, the other side answers, and ICE candidates are exchanged through D1. Audio and video
flow directly between browsers.

The default configuration uses Cloudflare and Google STUN servers. Peers behind restrictive NATs need
a TURN relay, and the call room asks the server for its ICE servers before it creates any peer
connection (it still waits for the camera and microphone first). There are two ways to provide TURN.

Cloudflare Realtime TURN (recommended). Create a TURN key in the Cloudflare dashboard, then store its
id and API token as server secrets. The server mints 24-hour credentials per call from
`https://rtc.live.cloudflare.com/v1/turn/keys/{key_id}/credentials/generate`, so nothing secret
reaches the browser:

```bash
npx void secret put CF_TURN_KEY_ID
npx void secret put CF_TURN_KEY_API_TOKEN
```

For local development put the same two names in `.env`. Both are optional keys in `env.ts`.

Any other TURN service. Without the two keys above, the room uses these build-time values, which are
embedded in the browser bundle, so only use a credential you can share:

```bash
VITE_TURN_URL=turn:turn.example.com:3478
VITE_TURN_USERNAME=...
VITE_TURN_CREDENTIAL=...
```

Set those in your shell or in the deployment environment before building. If minting fails, the
server falls back to this configuration and the public STUN servers.

### How realtime works

Nothing polls. Void's own realtime features (`void/live`, `.ws.ts` routes, `durable-objects/`) refuse
to run in TanStack Start (framework) mode, and the app worker's generated entry exports only
`default`, so it cannot host a Durable Object class. Realtime therefore lives in a small companion
Worker, `realtime/` (`kora-realtime`):

- One Durable Object per workspace (`WorkspaceHub`) holds every open WebSocket of that workspace,
  using the hibernation API, so idle sockets cost nothing.
- The browser asks the app for a ticket (`getRealtimeTicketFn`): an HMAC-signed, 5-minute grant
  naming the workspace, the person, and the channels and DMs they belong to. The worker checks the
  signature and the page's origin, then accepts the socket. When someone's channel access changes the
  app pushes `grants` and the open socket swaps in a fresh ticket.
- After every write, the app publishes a small event to the worker (`app/lib/realtime.ts`): what
  changed and where (`chat` in channel X, `issue` Y, `inbox` for person Z, `typing`, `call`,
  `signal`), never the content. Each screen refetches what it shows with the same server functions
  as before (`useLiveRefresh` in `app/lib/realtime-client.ts`). Bursts collapse into one refetch.
- Topics: `w` (everyone in the workspace), `c:<channel>` (only members, enforced by the ticket),
  `u:<person>` (every tab of one person).
- Presence comes from the sockets: the hub tells the app when someone's first tab connects or last
  tab closes, and every 30 s while anyone is connected (`/api/realtime/presence`, authenticated with
  the shared secret). `online` everywhere still reads `users.last_seen_at`.
- A missed event never leaves a screen stale: on every (re)connect, and when a tab comes back, the
  client refetches. The only timers left are a 25 s keepalive ping (answered without waking the
  Durable Object) and two write heartbeats: huddle membership (20 s) and "viewing this issue" (20 s).

### How GitHub works

GitHub is switched off for now: `GITHUB_ENABLED` in `app/lib/features.ts` hides every GitHub
control and makes the webhook and install routes answer 404. Set it to `true` to bring it back.

Kora is a GitHub App. An admin opens Tasks → GitHub (the branch icon in the sidebar footer) and
clicks Connect, which sends them to GitHub to install the app with a signed, 15-minute state. GitHub
returns to `/api/github/setup`, which only connects the installation when the state matches the
session, the person is a workspace admin, and GitHub confirms through that person's own OAuth token
that they can see the installation. Nobody can attach someone else's installation to their
workspace.

Deliveries arrive at `/api/github/webhook`, signed with `GITHUB_WEBHOOK_SECRET`
(`X-Hub-Signature-256`); anything unsigned or wrongly signed is refused before it is parsed.

- **Linking** (`app/lib/github-links.ts`): a key in the branch (`alade/kor-12-search`) or the title
  links in any case; in the description only upper-case keys link, and code is ignored. A closing word
  (`Fixes`, `Closes`, `Resolves`, `Completes`) or a branch or title key means merging finishes the
  issue; `Part of KOR-12` only links. Editing a key out unlinks it.
- **Automation** (`app/lib/github-server.ts`, per workspace in the dialog): PR opened (drafts too) →
  In Progress, review requested → In Review, merged → Done, each can be turned off. Issues only move
  forward and never leave Done or Canceled.
- Every link, state change and move writes a history line ("GitHub linked pull request …"),
  publishes `issue`, and a merge that finishes an issue sends its assignee an inbox item.

Set up the GitHub App once (github.com → Settings → Developer settings → GitHub Apps → New):

| Field | Value |
| --- | --- |
| Callback URL | `https://kora.zecreator.com/api/github/setup` |
| Request user authorization (OAuth) during installation | on |
| Setup URL | leave empty (the callback handles it) |
| Webhook URL | `https://kora.zecreator.com/api/github/webhook` |
| Webhook secret | `openssl rand -hex 32` |
| Repository permissions | Pull requests: read, Metadata: read |
| Subscribe to events | Pull request, Pull request review |

Then set `GITHUB_APP_SLUG` (the app's URL name), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and
`GITHUB_WEBHOOK_SECRET` (see Deploy). Locally any values work: `scripts/github.mjs` signs fake
deliveries with your local secret.

### MCP for AI agents

`/api/mcp` is a Model Context Protocol server (Streamable HTTP, stateless, JSON responses). Create a
token in Profile → AI agents; Kora shows it once and keeps only a SHA-256 hash. Then:

```bash
claude mcp add --transport http kora https://kora.zecreator.com/api/mcp \
  --header "Authorization: Bearer kora_…"
```

Tools: `list_workspaces`, `workspace_info`, `list_my_issues`, `search_issues`, `get_issue` (with
the git branch name and linked PRs), `create_issue`, `update_issue`, `add_comment`. Each call runs as
the token's owner (`runAsUser` in `app/lib/session.ts`) through the same server functions as the app,
so permissions, history lines, inbox items and live pushes all apply. An agent that starts KOR-12,
works on its `gitBranch` and opens a PR closes the loop with the GitHub integration. Browser requests
from another origin are refused; revoking a token stops it at once.

## Verification

Playwright scripts cover the main paths. Start the dev server, then run:

```bash
node scripts/smoke.mjs    # sign in, send a message, open a thread, search
node scripts/upload.mjs   # upload an image and render it from R2
node scripts/call.mjs     # two accounts join a huddle and exchange video
node scripts/realtime.mjs # push delivery, no polling, presence, and the worker's ticket and secret checks
node scripts/date-picker.mjs # the calendar picker: keyboard, Escape, quick picks, Clear, phone width
node scripts/ssrf.mjs     # link-preview address rules (private ranges rejected, public hosts allowed)
node scripts/typing.mjs   # typing in threads, comments, sidebar dots, and "editing the description"
node scripts/comments.mjs # Markdown comments: live formatting, ⌘↵, formatted render, plain inbox text
node scripts/github.mjs   # signed webhooks: linking, automation, reviews, merge, unlinking, guards
node scripts/mcp.mjs      # MCP: token UI, handshake, every tool, live updates, errors, guards
```

`scripts/github.mjs` needs the four `GITHUB_*` values in `.env` (any values work locally).

They expect the app at `http://localhost:5174` and the realtime worker at `http://localhost:8787`
(both started by `npm run dev`). Change the `base` constant if Vite picks another
port. The call script uses Chromium's fake media devices.

## Deploy

Sign in once, then always deploy with the script, never by hand:

```bash
npx void auth login
npx wrangler login
npm run deploy
```

Before the first deploy with realtime, set the shared secret on both Workers and tell the app where
the realtime worker lives (the worker serves `realtime.kora.zecreator.com`, see
`realtime/wrangler.jsonc`):

```bash
openssl rand -base64 32                                          # the shared secret
npx wrangler secret put REALTIME_SECRET -c realtime/wrangler.jsonc
npx void secret put REALTIME_SECRET
npx void secret put REALTIME_URL                                 # https://realtime.kora.zecreator.com
```

To turn on GitHub, set the four values from the GitHub App (see How GitHub works):

```bash
npx void secret put GITHUB_APP_SLUG
npx void secret put GITHUB_CLIENT_ID
npx void secret put GITHUB_CLIENT_SECRET
npx void secret put GITHUB_WEBHOOK_SECRET
```

`npm run deploy` runs, in order, and stops at the first failure:

1. `npm run typecheck` and `npm run build`
2. `npm run check:migrations`: refuses any migration that can delete data (`DROP TABLE`, table
   rebuilds, `DELETE FROM`, `DROP COLUMN`) unless the file says `-- reviewed: <why it is safe>`, and
   refuses when `db/schema.ts` no longer matches the latest migration snapshot
3. `void db migrate --remote`
4. `npm run deploy:realtime` (the `kora-realtime` worker)
5. `void deploy --platform cloudflare`

The realtime worker deploys before the app so the app never publishes to an older protocol. Steps 3
to 5 run back to back because a migration that renames something breaks the previous code;
the gap between them is the only window where old code meets the new schema.

On D1 a `DROP TABLE` cascades through every `ON DELETE CASCADE` child, so a table rebuild of
`issues` would delete every comment, label link and history line. Write such changes as additive
migrations (`ALTER TABLE ... ADD`, `RENAME`) instead.

`npx void db seed` and `npx void db reset` only touch the local database. Nothing in this repository
runs SQL against the deployed database except `npm run deploy`; avoid `void db execute --remote` for
anything that writes.

## Known limits

- Realtime events are delivered at most once. A client that misses one (a deploy of the realtime worker drops every socket) catches up when it reconnects, a second or two later.
- Each person can store 500 MB of uploads. Files uploaded but never attached to a message are deleted after 24 hours (checked on that person's next upload), and read inbox items are deleted after 90 days (checked when they open the inbox). Issue history is never pruned.
- Link previews resolve the target host over DNS-over-HTTPS and refuse private, loopback, link-local, CGNAT and unique-local addresses. Workers in production also block private egress, so this is a second layer; DNS rebinding between the check and the connection is covered by that platform block, not by Kora.
- Huddles are a peer-to-peer mesh, best for small rooms of two to four people.
- TURN is optional. Without `CF_TURN_KEY_ID` and `CF_TURN_KEY_API_TOKEN` (or `VITE_TURN_*`), some restrictive networks will fail to connect calls.
- Email invites, push notifications, message editing, and message deletion are not built yet.
- Search uses `LIKE` and is intended for small teams, not large message archives.
- Inbox items for a chat message open the channel, not the exact message.
- The task list loads the 500 most recently updated issues (the list says so when it is capped). While
  it is capped, typing in the search box also asks the server, which matches title or key across every
  issue (up to 50 results), so older issues are found too.
- Sign-in locks an email for 15 minutes after 5 wrong passwords from the same IP address; a different
  IP is not locked out. Across all IPs an email is limited to 50 failures per hour.
- Project updates (status, lead, dates) are not recorded in an issue's history.

## License

MIT
