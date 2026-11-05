# Kora agent notes

Kora is a Void + TanStack Start app on Cloudflare. Read `README.md` first.

## Commands

- `npm run dev` starts Vite and the local D1 database.
- `npm run typecheck` must pass before a commit.
- `npm run build` must pass before a deploy.
- `npx void db generate` after editing `db/schema.ts`.
- `npx void db seed` resets the local database and loads the demo workspace.
- `node scripts/smoke.mjs`, `node scripts/upload.mjs`, and `node scripts/call.mjs` verify the app at
  `http://localhost:5174`.

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
- Client components never import tables or `void/db`.
- Any change to an issue writes a history line and any event that concerns someone writes an inbox
  item, both through `app/lib/activity.ts` (`recordIssueEvent`, `notify`). Store display text, not
  ids, in history values.
- Issue references in text are the plain key (`KOR-12`); never store markup for them.
- Polling stays at 2 seconds for chat and 900 ms for call signals. Do not tighten it without
  measuring D1 load.
- The call room gates WebRTC setup on the local media stream. Do not create peer connections before
  camera and microphone resolve.
- The demo data in `db/seed.ts` is the reference for empty-state copy and realistic conversations.
- Avoid em dashes in product copy.

## Product shape

The app is a focused Slack alternative: channels, DMs, threads, reactions, files, search, presence,
and huddles. Do not add bots, workflows, or integrations until the core room is solid.
