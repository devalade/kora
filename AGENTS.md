# Kora agent notes

Kora is a Void + TanStack Start app on Cloudflare. Read `README.md` first.

## Commands

- `npm run dev` starts Vite, the local D1 database and the realtime worker (`realtime/`, port 8787).
- `npm run typecheck` must pass before a commit.
- `npm run build` must pass before a deploy.
- `npx void db generate` after editing `db/schema.ts`.
- `npx void db seed` resets the local database and loads the demo workspace.
- `node scripts/smoke.mjs`, `node scripts/upload.mjs`, and `node scripts/call.mjs` verify the app at
  `http://localhost:5174`. `node scripts/realtime.mjs` checks push delivery, presence and the worker's guards, and
  `node scripts/ssrf.mjs` checks the link-preview address rules.
- `npm run deploy` is the only way to ship: it checks migrations, migrates the remote database and
  deploys back to back. Never run writes with `void db execute --remote`.
- `npm run check:migrations` must pass after any schema change. On D1 a table rebuild (`DROP TABLE`)
  cascades and deletes child rows; write additive migrations instead.
- `node scripts/cleanup-test-data.mjs` removes the throwaway accounts and rows the scripts leave in
  the local database.

## Before you say a change is done

- Run every script in `scripts/` against the dev server, not only the one for the area you touched.
  When a UI change breaks a script's selector, update the script in the same change. A failing
  script is a failing build.
- Test workspace features in a newly created workspace, not only in the seeded Kora Studio. The seed
  hides bugs in first-run paths: missing default statuses, missing projects, empty states.
- Test realtime features (typing, presence, live updates) with two signed-in accounts at once.

## Conventions

- Server functions live in `app/lib/*.ts` next to their domain. Only export `createServerFn`
  functions and types from files the client imports. Server-only helpers go in `session.ts`,
  `server.ts`, or `attachments.ts`.
- Keep database access behind `requireUser`, `requireWorkspace`, and `requireChannel`.
- Anything that changes things for everyone (workflow statuses, deleting labels, teams, deleting
  projects) goes through `requireAdmin`. Deleting an issue is allowed for its creator or an admin,
  and is a soft delete (`deleted_at`); every issue read must exclude the trash.
- Client components never import tables or `void/db`.
- Any change to an issue writes a history line and any event that concerns someone writes an inbox
  item, both through `app/lib/activity.ts` (`recordIssueEvent`, `notify`). Store display text, not
  ids, in history values.
- Issue references in text are the plain key (`KOR-12`); never store markup for them.
- Nothing polls. Every server function that changes something others can see ends with
  `publish(...)` from `app/lib/realtime.ts` (after the write, never before), and every screen that
  shows shared data refreshes through `useLiveRefresh` in `app/lib/realtime-client.ts`. A new write
  without a publish is a bug: other people will not see it until they reload. Events name what
  changed (`RealtimeEvent` in `app/lib/realtime-protocol.ts`), never the content, because the worker
  does not check reads; channel topics are limited to members by the signed ticket.
- Do not add `setInterval` fetches. Timers that only write (huddle and issue-viewer heartbeats) or
  only change local UI are fine.
- When channel membership changes, publish `grants` to each affected person so their open socket
  picks up the new channel.
- `workspaceSnapshotFn` runs 11 queries and must not gain unbounded scans of message history; every
  chat event triggers one per open channel page.
- The call room gates WebRTC setup on the local media stream. Do not create peer connections before
  camera and microphone resolve.
- The demo data in `db/seed.ts` is the reference for empty-state copy and realistic conversations.
- Avoid em dashes in product copy.

## Product shape

The app is a focused Slack alternative: channels, DMs, threads, reactions, files, search, presence,
and huddles. Do not add bots, workflows, or integrations until the core room is solid.
