import { defineSeed } from 'void/seed';
import { hashPassword } from '../app/lib/password';

export default defineSeed<typeof import('./schema')>(async ({ db, schema }) => {
  const passwordHash = await hashPassword('demo1234');
  const now = Date.now();
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

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
});
