import { defineSeed } from 'void/seed';
import { hashPassword } from '../app/lib/password';
import { DEFAULT_TASK_STATUSES } from '../app/lib/task-config';

export default defineSeed<typeof import('./schema')>(async ({ db, schema }) => {
  const passwordHash = await hashPassword('demo1234');
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const day = (offset: number) => new Date(now + offset * 86_400_000).toISOString().slice(0, 10);

  const people = [
    {
      id: 'u-alade',
      email: 'alade@kora.app',
      name: 'Alade Yessoufou',
      avatarColor: '#D97757',
      title: 'Product engineer',
      statusEmoji: '🛠️',
      statusText: 'Building Kora',
    },
    {
      id: 'u-amina',
      email: 'amina@kora.app',
      name: 'Amina Diallo',
      avatarColor: '#5B8DEF',
      title: 'Design lead',
      statusEmoji: '🎨',
      statusText: 'In Figma',
    },
    {
      id: 'u-kwame',
      email: 'kwame@kora.app',
      name: 'Kwame Mensah',
      avatarColor: '#18A999',
      title: 'Backend engineer',
      statusEmoji: '🌍',
      statusText: 'Accra',
    },
    {
      id: 'u-zane',
      email: 'zane@kora.app',
      name: 'Zane Miller',
      avatarColor: '#B07AA1',
      title: 'Growth',
      statusEmoji: '📈',
      statusText: 'Watching signups',
    },
  ];

  await db.insert(schema.users).values(
    people.map((person, index) => ({
      ...person,
      passwordHash,
      lastSeenAt: at(index * 0.2),
    })),
  );

  await db.insert(schema.workspaces).values({
    id: 'ws-kora',
    name: 'Kora Studio',
    slug: 'kora-studio',
    inviteCode: 'KORA-DEMO-2026',
    createdBy: 'u-alade',
    createdAt: at(60 * 24 * 9),
  });

  await db.insert(schema.workspaceMembers).values(
    people.map((person, index) => ({
      workspaceId: 'ws-kora',
      userId: person.id,
      role: index === 0 ? 'owner' : 'member',
      joinedAt: at(60 * 24 * 8),
    })),
  );

  const publicChannels = [
    { id: 'ch-general', name: 'general', topic: 'Team-wide announcements and the daily pulse.' },
    { id: 'ch-product', name: 'product', topic: 'What we are building, shipping, and arguing about.' },
    { id: 'ch-design', name: 'design', topic: 'Screens, type, and the details nobody notices until they do.' },
    { id: 'ch-random', name: 'random', topic: 'Links, jokes, and everything off-topic.' },
  ];

  await db.insert(schema.channels).values([
    ...publicChannels.map((channel, index) => ({
      ...channel,
      workspaceId: 'ws-kora',
      kind: 'public',
      createdBy: 'u-alade',
      createdAt: at(60 * 24 * 8 - index * 10),
    })),
    {
      id: 'ch-launch',
      workspaceId: 'ws-kora',
      name: 'launch-private',
      topic: 'Launch week. Keep it tight.',
      kind: 'private',
      createdBy: 'u-alade',
      createdAt: at(60 * 24 * 3),
    },
    {
      id: 'ch-dm-alade-amina',
      workspaceId: 'ws-kora',
      name: '',
      topic: '',
      kind: 'dm',
      createdBy: 'u-alade',
      createdAt: at(60 * 24 * 2),
    },
  ]);

  for (const channel of publicChannels) {
    await db.insert(schema.channelMembers).values(
      people.map((person) => ({
        channelId: channel.id,
        userId: person.id,
        lastReadAt: at(180),
        joinedAt: at(60 * 24 * 7),
      })),
    );
  }

  await db.insert(schema.channelMembers).values([
    { channelId: 'ch-launch', userId: 'u-alade', lastReadAt: at(30), joinedAt: at(60 * 24 * 3) },
    { channelId: 'ch-launch', userId: 'u-amina', lastReadAt: at(30), joinedAt: at(60 * 24 * 3) },
    { channelId: 'ch-launch', userId: 'u-kwame', lastReadAt: at(30), joinedAt: at(60 * 24 * 3) },
    { channelId: 'ch-dm-alade-amina', userId: 'u-alade', lastReadAt: at(5), joinedAt: at(60 * 24 * 2) },
    { channelId: 'ch-dm-alade-amina', userId: 'u-amina', lastReadAt: at(5), joinedAt: at(60 * 24 * 2) },
  ]);

  const entries: {
    id: string;
    channelId: string;
    userId: string;
    body: string;
    minutes: number;
    parentId?: string;
  }[] = [
    {
      id: 'm-1',
      channelId: 'ch-general',
      userId: 'u-amina',
      body: 'Morning team. The new workspace is live. Say hi 👋',
      minutes: 132,
    },
    {
      id: 'm-2',
      channelId: 'ch-general',
      userId: 'u-kwame',
      body: 'Hi from Accra. Shipping the message API today.',
      minutes: 128,
    },
    {
      id: 'm-3',
      channelId: 'ch-general',
      userId: 'u-alade',
      body: 'Welcome. Drop what you are working on in the thread below.',
      minutes: 124,
    },
    {
      id: 'm-4',
      channelId: 'ch-general',
      userId: 'u-zane',
      body: 'The launch page is up. Analytics says 42 signups overnight 🎉',
      minutes: 101,
    },
    {
      id: 'm-5',
      channelId: 'ch-general',
      userId: 'u-amina',
      body: 'That hero is doing numbers. The product shot carries it.',
      minutes: 96,
    },
    {
      id: 'm-6',
      channelId: 'ch-general',
      userId: 'u-kwame',
      body: 'Threads are live on staging. Replies, counts, the whole thing.',
      minutes: 71,
      parentId: 'm-3',
    },
    {
      id: 'm-7',
      channelId: 'ch-general',
      userId: 'u-alade',
      body: 'Tried it. The reply count updating without a refresh is the good part.',
      minutes: 64,
      parentId: 'm-3',
    },
    {
      id: 'm-8',
      channelId: 'ch-general',
      userId: 'u-amina',
      body: 'Can we keep the thread panel open when I switch channels? It is my second screen.',
      minutes: 55,
      parentId: 'm-3',
    },
    {
      id: 'm-9',
      channelId: 'ch-product',
      userId: 'u-alade',
      body: 'Kora 0.2 scope: threads, reactions, files, calls. Calls first.',
      minutes: 88,
    },
    {
      id: 'm-10',
      channelId: 'ch-product',
      userId: 'u-kwame',
      body: 'Signaling is on D1 for now. Fine for small rooms, we can move to Durable Objects later.',
      minutes: 82,
    },
    {
      id: 'm-11',
      channelId: 'ch-product',
      userId: 'u-amina',
      body: 'I will take the call overlay and the empty states.',
      minutes: 77,
    },
    {
      id: 'm-12',
      channelId: 'ch-design',
      userId: 'u-amina',
      body: 'Shipped the new sidebar. Unread badges are bolder, DMs get a face.',
      minutes: 58,
    },
    {
      id: 'm-13',
      channelId: 'ch-design',
      userId: 'u-alade',
      body: 'The coral accent is doing a lot of work. Keep it.',
      minutes: 49,
    },
    {
      id: 'm-14',
      channelId: 'ch-random',
      userId: 'u-zane',
      body: 'Found a coffee place that roasts on site. Field trip.',
      minutes: 44,
    },
    {
      id: 'm-15',
      channelId: 'ch-random',
      userId: 'u-kwame',
      body: 'It is 9am and I have already shipped two bugs.',
      minutes: 38,
    },
    {
      id: 'm-16',
      channelId: 'ch-launch',
      userId: 'u-alade',
      body: 'Launch plan: Wednesday, 9am GMT. Landing page, Product Hunt, and the demo video.',
      minutes: 27,
    },
    {
      id: 'm-17',
      channelId: 'ch-dm-alade-amina',
      userId: 'u-amina',
      body: 'Do you have five minutes for a call?',
      minutes: 12,
    },
    {
      id: 'm-18',
      channelId: 'ch-dm-alade-amina',
      userId: 'u-alade',
      body: 'Yes. Ring me when you are ready.',
      minutes: 9,
    },
    {
      id: 'm-19',
      channelId: 'ch-dm-alade-amina',
      userId: 'u-amina',
      body: 'Starting now.',
      minutes: 4,
    },
  ];

  await db.insert(schema.messages).values(
    entries.map((entry) => ({
      id: entry.id,
      channelId: entry.channelId,
      userId: entry.userId,
      body: entry.body,
      parentId: entry.parentId ?? null,
      createdAt: at(entry.minutes),
    })),
  );

  await db.insert(schema.reactions).values([
    { messageId: 'm-1', userId: 'u-alade', emoji: '👋' },
    { messageId: 'm-1', userId: 'u-kwame', emoji: '👋' },
    { messageId: 'm-1', userId: 'u-zane', emoji: '👋' },
    { messageId: 'm-4', userId: 'u-alade', emoji: '🎉' },
    { messageId: 'm-4', userId: 'u-amina', emoji: '🎉' },
    { messageId: 'm-4', userId: 'u-kwame', emoji: '🎉' },
    { messageId: 'm-12', userId: 'u-alade', emoji: '❤️' },
    { messageId: 'm-13', userId: 'u-amina', emoji: '🔥' },
  ]);

  await db.insert(schema.officePresence).values([
    {
      workspaceId: 'ws-kora',
      userId: 'u-alade',
      zone: 'floor',
      x: 44,
      y: 56,
      activity: 'Building Kora',
      status: 'available',
      updatedAt: at(1),
    },
    {
      workspaceId: 'ws-kora',
      userId: 'u-amina',
      zone: 'focus',
      x: 17,
      y: 24,
      activity: 'Reviewing the new task flow',
      status: 'focus',
      updatedAt: at(4),
    },
    {
      workspaceId: 'ws-kora',
      userId: 'u-kwame',
      zone: 'huddle',
      x: 74,
      y: 22,
      activity: 'Huddle with Zane',
      status: 'huddle',
      updatedAt: at(7),
    },
    {
      workspaceId: 'ws-kora',
      userId: 'u-zane',
      zone: 'lounge',
      x: 18,
      y: 78,
      activity: 'Reviewing launch copy',
      status: 'focus',
      updatedAt: at(8),
    },
  ]);

  await db.insert(schema.officeActivities).values([
    {
      id: 'oa-1',
      workspaceId: 'ws-kora',
      userId: 'u-alade',
      kind: 'activity',
      detail: 'Is now “Building Kora”',
      createdAt: at(1),
    },
    {
      id: 'oa-2',
      workspaceId: 'ws-kora',
      userId: 'u-amina',
      kind: 'moved',
      detail: 'Moved to the Focus room',
      createdAt: at(4),
    },
    {
      id: 'oa-3',
      workspaceId: 'ws-kora',
      userId: 'u-kwame',
      kind: 'call',
      detail: 'Joined the Studio huddle',
      createdAt: at(7),
    },
    {
      id: 'oa-4',
      workspaceId: 'ws-kora',
      userId: 'u-zane',
      kind: 'moved',
      detail: 'Moved to the Lounge',
      createdAt: at(8),
    },
  ]);

  await db.insert(schema.taskStatuses).values(
    DEFAULT_TASK_STATUSES.map((status) => ({
      ...status,
      workspaceId: 'ws-kora',
      createdAt: at(60 * 24 * 9),
    })),
  );

  await db.insert(schema.projects).values([
    {
      id: 'p-kora',
      workspaceId: 'ws-kora',
      name: 'Kora Tasks',
      key: 'KOR',
      description: 'The product work behind Kora.',
      color: '#EF5F3E',
      createdBy: 'u-alade',
      createdAt: at(60 * 24 * 8),
    },
    {
      id: 'p-launch',
      workspaceId: 'ws-kora',
      name: 'Launch',
      key: 'LAU',
      description: 'Launch week and go-to-market.',
      color: '#17795F',
      createdBy: 'u-alade',
      createdAt: at(60 * 24 * 6),
    },
  ]);

  await db.insert(schema.labels).values([
    { id: 'l-bug', workspaceId: 'ws-kora', name: 'Bug', color: '#D84A2B' },
    { id: 'l-design', workspaceId: 'ws-kora', name: 'Design', color: '#B07AA1' },
    { id: 'l-frontend', workspaceId: 'ws-kora', name: 'Frontend', color: '#5B8DEF' },
    { id: 'l-backend', workspaceId: 'ws-kora', name: 'Backend', color: '#18A999' },
    { id: 'l-growth', workspaceId: 'ws-kora', name: 'Growth', color: '#E0A23B' },
    { id: 'l-polish', workspaceId: 'ws-kora', name: 'Polish', color: '#D45D79' },
  ]);

  const issueRows = [
    {
      id: 'i-1', projectId: 'p-kora', number: 1, title: 'Ship the Studio virtual office',
      description: 'A spatial Studio with rooms, live activity, and a huddle that starts in place.',
      status: 'done', priority: 2, assigneeId: 'u-alade', createdAt: at(60), updatedAt: at(6),
    },
    {
      id: 'i-2', projectId: 'p-kora', number: 2, title: 'Add live presence to the Studio floor',
      description: 'Show each person status and what they are doing. Poll every 3s until Durable Objects are available.\n\n### Checklist\n- [x] Presence badges\n- [x] Live activity feed\n- [ ] Move polling to Durable Objects',
      status: 'in_progress', priority: 2, assigneeId: 'u-amina', createdAt: at(90), updatedAt: at(3),
    },
    {
      id: 'i-3', projectId: 'p-kora', number: 3, title: 'Fix clipped emoji in the reaction bar',
      description: 'The quick reaction bar was clipping taller emoji. More room, higher stacking, and a larger hit area.',
      status: 'done', priority: 1, assigneeId: 'u-alade', createdAt: at(120), updatedAt: at(20),
    },
    {
      id: 'i-4', projectId: 'p-kora', number: 4, title: 'Tasks: list and board views',
      description: 'List grouped by status with virtualized rows, plus a board. Status changes should be optimistic.\n\n### Checklist\n- [x] Virtualized list\n- [x] Board with drag and drop\n- [ ] Command menu\n- [ ] Keyboard shortcuts\n\nShip the **list** first, then reuse the status mutation for the board.',
      status: 'in_progress', priority: 2, assigneeId: 'u-alade', createdAt: at(80), updatedAt: at(2),
    },
    {
      id: 'i-5', projectId: 'p-kora', number: 5, title: 'Command menu for tasks',
      description: 'Cmd K to create an issue, jump to a project, or move to chat or Studio.\n\n- [x] Command menu shell\n- [x] Project actions\n- [ ] Create issue action\n\nUse `⌘K` on any task view.',
      status: 'todo', priority: 3, assigneeId: 'u-alade', createdAt: at(70), updatedAt: at(8),
    },
    {
      id: 'i-6', projectId: 'p-kora', number: 6, title: 'Comments and activity on issues',
      description: 'Threaded comments on the issue detail panel with author avatars and timestamps.',
      status: 'todo', priority: 3, assigneeId: 'u-kwame', createdAt: at(65), updatedAt: at(12),
    },
    {
      id: 'i-7', projectId: 'p-kora', number: 7, title: 'Mobile room list',
      description: 'At narrow widths, the floor plan becomes a room-by-room list.',
      status: 'done', priority: 3, assigneeId: 'u-amina', createdAt: at(55), updatedAt: at(15),
    },
    {
      id: 'i-8', projectId: 'p-kora', number: 8, title: 'Agent can pick up a repo issue',
      description: 'Connect a repo, assign an issue to the agent, and let it open a branch. Permissions and audit trail first.',
      status: 'backlog', priority: 2, assigneeId: 'u-kwame', createdAt: at(50), updatedAt: at(18),
    },
    {
      id: 'i-9', projectId: 'p-kora', number: 9, title: 'Project covers from Grok',
      description: 'Use the Grok-generated isometric board as the empty-state cover.',
      status: 'todo', priority: 4, assigneeId: 'u-zane', createdAt: at(45), updatedAt: at(22),
    },
    {
      id: 'i-10', projectId: 'p-kora', number: 10, title: 'Keyboard shortcuts j/k and c',
      description: 'C for new issue, J/K to move, Enter to open, Escape to close.',
      status: 'todo', priority: 3, assigneeId: 'u-alade', createdAt: at(40), updatedAt: at(26),
    },
    {
      id: 'i-11', projectId: 'p-kora', number: 11, title: 'Empty states that feel alive',
      description: 'Make the empty state feel like a place, not a blank table.',
      status: 'backlog', priority: 4, assigneeId: 'u-amina', createdAt: at(35), updatedAt: at(30),
    },
    {
      id: 'i-12', projectId: 'p-kora', number: 12, title: 'Search across issues',
      description: 'Search titles and descriptions across projects.',
      status: 'todo', priority: 3, assigneeId: 'u-kwame', createdAt: at(30), updatedAt: at(32),
    },
    {
      id: 'i-13', projectId: 'p-launch', number: 1, title: 'Write the launch post',
      description: 'A short launch post with the Studio screenshot and the task app.',
      status: 'in_review', priority: 2, assigneeId: 'u-zane', createdAt: at(25), updatedAt: at(2),
    },
    {
      id: 'i-14', projectId: 'p-launch', number: 2, title: 'Landing page copy pass',
      description: 'Tighten the hero, pricing, and the three feature blocks.',
      status: 'todo', priority: 3, assigneeId: 'u-amina', createdAt: at(20), updatedAt: at(9),
    },
    {
      id: 'i-15', projectId: 'p-kora', number: 13, title: 'Use a full calendar view',
      description: 'Not now. The list and board cover the daily loop.',
      status: 'canceled', priority: 4, assigneeId: null, createdAt: at(60), updatedAt: at(40),
    },
    {
      id: 'i-16', projectId: 'p-kora', number: 14, title: 'Virtualize the issue list',
      description: 'Keep the list fast as the workspace grows.',
      status: 'done', priority: 3, assigneeId: 'u-alade', parentIssueId: 'i-4',
      createdAt: at(70), updatedAt: at(18),
    },
    {
      id: 'i-17', projectId: 'p-kora', number: 15, title: 'Board drag and drop',
      description: 'Move cards between workflow statuses with optimistic feedback.',
      status: 'in_progress', priority: 2, assigneeId: 'u-amina', parentIssueId: 'i-4',
      createdAt: at(68), updatedAt: at(4),
    },
    {
      id: 'i-18', projectId: 'p-kora', number: 16, title: 'Keyboard shortcuts',
      description: 'C, J, K, Enter, and Escape should work across every task view.',
      status: 'todo', priority: 3, assigneeId: 'u-alade', parentIssueId: 'i-4',
      createdAt: at(66), updatedAt: at(11),
    },
  ];

  const issueDates: Record<string, [number, number]> = {
    'i-1': [-21, -14],
    'i-2': [-4, 3],
    'i-3': [-18, -16],
    'i-4': [-2, 5],
    'i-5': [2, 9],
    'i-6': [0, 11],
    'i-7': [-12, -8],
    'i-8': [5, 16],
    'i-9': [1, 7],
    'i-10': [-1, 4],
    'i-11': [8, 18],
    'i-12': [3, 14],
    'i-13': [-6, 2],
    'i-14': [-2, 6],
    'i-15': [-20, -10],
    'i-16': [-2, 1],
    'i-17': [0, 3],
    'i-18': [1, 5],
  };

  await db.insert(schema.issues).values(
    issueRows.map((row) => {
      const dates = issueDates[row.id] ?? [0, 7];
      return {
        ...row,
        workspaceId: 'ws-kora',
        createdBy: 'u-alade',
        startDate: day(dates[0]),
        dueDate: day(dates[1]),
        parentIssueId: (row as { parentIssueId?: string }).parentIssueId ?? null,
      };
    }),
  );

  await db.insert(schema.issueLabels).values([
    { issueId: 'i-1', labelId: 'l-design' },
    { issueId: 'i-1', labelId: 'l-polish' },
    { issueId: 'i-2', labelId: 'l-frontend' },
    { issueId: 'i-2', labelId: 'l-design' },
    { issueId: 'i-3', labelId: 'l-bug' },
    { issueId: 'i-3', labelId: 'l-polish' },
    { issueId: 'i-4', labelId: 'l-frontend' },
    { issueId: 'i-5', labelId: 'l-frontend' },
    { issueId: 'i-6', labelId: 'l-backend' },
    { issueId: 'i-7', labelId: 'l-frontend' },
    { issueId: 'i-7', labelId: 'l-design' },
    { issueId: 'i-8', labelId: 'l-backend' },
    { issueId: 'i-9', labelId: 'l-design' },
    { issueId: 'i-10', labelId: 'l-frontend' },
    { issueId: 'i-11', labelId: 'l-design' },
    { issueId: 'i-11', labelId: 'l-polish' },
    { issueId: 'i-12', labelId: 'l-backend' },
    { issueId: 'i-13', labelId: 'l-growth' },
    { issueId: 'i-14', labelId: 'l-growth' },
    { issueId: 'i-14', labelId: 'l-design' },
    { issueId: 'i-16', labelId: 'l-frontend' },
    { issueId: 'i-17', labelId: 'l-frontend' },
    { issueId: 'i-18', labelId: 'l-frontend' },
  ]);

  await db.insert(schema.issueComments).values([
    {
      id: 'c-1', issueId: 'i-4', userId: 'u-alade',
      body: 'Board drag is next. List first, then we can reuse the status mutation.',
      createdAt: at(52),
    },
    {
      id: 'c-2', issueId: 'i-4', userId: 'u-amina',
      body: 'Keep the rows dense. Linears rhythm comes from the 44px row, not the type.',
      createdAt: at(44),
    },
    {
      id: 'c-3', issueId: 'i-2', userId: 'u-kwame',
      body: 'Presence is polling every 3s. I will move it to Durable Objects once we have the realtime layer.',
      createdAt: at(38),
    },
    {
      id: 'c-4', issueId: 'i-8', userId: 'u-zane',
      body: 'Start with read-only repo access and a branch, not direct pushes.',
      createdAt: at(30),
    },
  ]);
});
