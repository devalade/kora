import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Coffee,
  ListTodo,
  Map as MapIcon,
  MapPin,
  Menu,
  MessageSquare,
  PencilLine,
  Phone,
  Plus,
  Sparkles,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSessionUserFn, signOutFn } from '../lib/auth';
import { openDmFn } from '../lib/chat';
import { getOfficeFn, joinStudioCallFn, updateOfficeFn } from '../lib/office';
import type { OfficeActivity, OfficePerson, OfficeSnapshot, OfficeStatus } from '../lib/types';
import { relativeTime } from '../lib/format';
import { Avatar } from '../components/avatar';
import { CallRoom } from '../components/call-room';
import { cn } from '../utils/cn';

export const Route = createFileRoute('/app/$workspaceSlug/office')({
  beforeLoad: async () => {
    const user = await getSessionUserFn();
    if (!user) throw redirect({ to: '/login' });
    return { user };
  },
  loader: async ({ params }) => getOfficeFn({ data: { slug: params.workspaceSlug } }),
  head: () => ({ meta: [{ title: 'Studio · Kora' }] }),
  component: OfficePage,
});

const ZONE_META: Record<
  string,
  { label: string; short: string; icon: typeof MapPin; color: string }
> = {
  floor: { label: 'Studio floor', short: 'Floor', icon: MapIcon, color: 'var(--mint-deep)' },
  focus: { label: 'Focus room', short: 'Focus', icon: Sparkles, color: 'var(--gold)' },
  lounge: { label: 'Lounge', short: 'Lounge', icon: Coffee, color: '#b07aa1' },
  huddle: { label: 'Huddle room', short: 'Huddle', icon: Video, color: 'var(--coral)' },
  kitchen: { label: 'Kitchen', short: 'Kitchen', icon: Coffee, color: '#6c8e3b' },
};

const STATUS_META: Record<
  OfficeStatus,
  { label: string; dot: string; text: string; bg: string }
> = {
  available: {
    label: 'Available',
    dot: 'bg-mint-deep',
    text: 'text-mint-deep',
    bg: 'bg-mint/40',
  },
  focus: {
    label: 'Focus',
    dot: 'bg-gold',
    text: 'text-[#8a6119]',
    bg: 'bg-[#f7ecd2]',
  },
  away: {
    label: 'Away',
    dot: 'bg-faint',
    text: 'text-muted',
    bg: 'bg-line-soft',
  },
  huddle: {
    label: 'In a huddle',
    dot: 'bg-coral',
    text: 'text-coral-deep',
    bg: 'bg-coral-soft',
  },
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function OfficePage() {
  const initial = Route.useLoaderData();
  const params = Route.useParams();
  const navigate = useNavigate();
  const [office, setOffice] = useState<OfficeSnapshot>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activityDraft, setActivityDraft] = useState('');
  const [activityFocused, setActivityFocused] = useState(false);
  const requestRef = useRef(0);
  const activityRef = useRef<HTMLInputElement>(null);

  const mePerson = office.people.find((person) => person.user.id === office.me.id) ?? null;
  const selected = selectedId
    ? office.people.find((person) => person.user.id === selectedId) ?? null
    : null;
  const online = office.people.filter((person) => person.online);
  const recently = office.people.filter((person) => !person.online);
  const joinedCall = Boolean(
    office.call?.participants.some((participant) => participant.userId === office.me.id),
  );
  const zoneCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of online) counts.set(person.zone, (counts.get(person.zone) ?? 0) + 1);
    return counts;
  }, [online]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const next = await getOfficeFn({ data: { slug: params.workspaceSlug } });
      if (request === requestRef.current) setOffice(next);
    } catch {
      // The next poll recovers a dropped read.
    }
  }, [params.workspaceSlug]);

  useEffect(() => {
    setOffice(initial);
  }, [initial]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 3000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (callOpen && !office.call) setCallOpen(false);
  }, [callOpen, office.call]);

  useEffect(() => {
    if (activityFocused) return;
    setActivityDraft(mePerson?.activity ?? '');
  }, [activityFocused, mePerson?.activity]);

  async function update(patch: {
    zone?: string;
    activity?: string;
    status?: OfficeStatus;
  }) {
    try {
      await updateOfficeFn({ data: { slug: params.workspaceSlug, ...patch } });
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the Studio.');
    }
  }

  async function move(zone: string) {
    if (!mePerson || mePerson.zone === zone) return;
    await update({ zone });
  }

  async function setStatus(status: OfficeStatus) {
    if (!mePerson) return;
    if (status === 'focus') {
      await update({ status, zone: mePerson.zone === 'focus' ? undefined : 'focus' });
      return;
    }
    if (status === 'available' && mePerson.zone === 'focus') {
      await update({ status, zone: 'floor' });
      return;
    }
    await update({ status });
  }

  async function saveActivity() {
    if (!mePerson) return;
    const next = activityDraft.trim();
    if (next === mePerson.activity) return;
    await update({ activity: next });
  }

  async function joinCall() {
    try {
      await joinStudioCallFn({ data: { slug: params.workspaceSlug } });
      await load();
      setCallOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not join the Studio huddle.');
    }
  }

  async function leaveCall() {
    setCallOpen(false);
    await update({ status: 'available', activity: 'Around the Studio', zone: 'floor' });
  }

  async function messagePerson(userId: string) {
    try {
      const { channelId } = await openDmFn({
        data: { workspaceId: office.workspace.id, userId },
      });
      await navigate({
        to: '/app/$workspaceSlug/$channelId',
        params: { workspaceSlug: params.workspaceSlug, channelId },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open the conversation.');
    }
  }

  async function signOut() {
    await signOutFn();
    await navigate({ to: '/' });
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <OfficeShell
        office={office}
        onlineCount={online.length}
        zoneCounts={zoneCounts}
        activeZone={mePerson?.zone ?? 'floor'}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        onMove={(zone) => void move(zone)}
        onSignOut={() => void signOut()}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[64px] shrink-0 items-center justify-between gap-3 border-b border-line bg-paper/85 px-4 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="grid size-9 place-items-center rounded-[11px] text-muted transition hover:bg-line-soft active:scale-[0.96] md:hidden"
              aria-label="Open Studio navigation"
            >
              <Menu size={19} />
            </button>
            <span className="grid size-9 place-items-center rounded-xl bg-mint/50 text-mint-deep">
              <MapIcon size={18} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">Studio</h1>
              <p className="truncate text-[11px] text-muted">
                {online.length} {online.length === 1 ? 'person' : 'people'} in the room
                {office.call ? ' · huddle live' : ' · quiet'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => (joinedCall ? setCallOpen(true) : void joinCall())}
              className={cn(
                'inline-flex h-9 items-center gap-2 rounded-[11px] border px-3 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.96]',
                joinedCall
                  ? 'border-mint-deep/25 bg-mint/45 text-mint-deep'
                  : 'border-line text-ink-soft hover:border-ink/20 hover:bg-canvas',
              )}
            >
              {joinedCall ? <Video size={15} /> : <Phone size={15} />}
              <span className="hidden sm:inline">
                {joinedCall ? 'Return to call' : office.call ? 'Join huddle' : 'Start huddle'}
              </span>
              {office.call && (
                <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold">
                  {office.call.participants.length}
                </span>
              )}
            </button>
            <Link
              to="/app/$workspaceSlug"
              params={{ workspaceSlug: params.workspaceSlug }}
              className="hidden h-9 items-center gap-2 rounded-[11px] px-3 text-xs font-semibold text-muted transition hover:bg-line-soft hover:text-ink sm:inline-flex"
            >
              <ArrowLeft size={14} /> Channels
            </Link>
          </div>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 p-4 md:p-5 xl:flex-row">
            <section className="min-w-0 flex-1">
              <div className="hidden xl:block">
                <FloorPlan
                  people={office.people}
                  meId={office.me.id}
                  selectedId={selectedId}
                  activeZone={mePerson?.zone ?? 'floor'}
                  call={office.call}
                  onSelect={setSelectedId}
                  onMove={(zone) => void move(zone)}
                />
              </div>
              <div className="xl:hidden">
                <MobileFloor
                  people={office.people}
                  meId={office.me.id}
                  activeZone={mePerson?.zone ?? 'floor'}
                  onSelect={setSelectedId}
                  onMove={(zone) => void move(zone)}
                />
              </div>
            </section>

            <aside className="flex w-full shrink-0 flex-col gap-3 xl:w-[330px]">
              {selected && selected.user.id !== office.me.id && (
                <PersonCard
                  person={selected}
                  onClose={() => setSelectedId(null)}
                  onMessage={() => void messagePerson(selected.user.id)}
                />
              )}

              <section className="hidden rounded-[20px] border border-line/80 bg-paper p-4 shadow-[var(--kora-shadow-composer)] xl:block">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold">Here now</h2>
                  <span className="rounded-full bg-mint/40 px-2 py-0.5 text-[10px] font-semibold text-mint-deep">
                    {online.length} online
                  </span>
                </div>
                <div className="mt-3 space-y-0.5">
                  {online.length === 0 && (
                    <p className="rounded-xl bg-canvas px-3 py-4 text-center text-xs leading-5 text-muted">
                      The room is quiet. Set your status and invite someone in.
                    </p>
                  )}
                  {online.map((person) => (
                    <button
                      key={person.user.id}
                      type="button"
                      onClick={() => setSelectedId(person.user.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors duration-100 hover:bg-canvas',
                        selectedId === person.user.id && 'bg-canvas',
                      )}
                    >
                      <Avatar
                        name={person.user.name}
                        color={person.user.avatarColor}
                        size="sm"
                        online
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[12px] font-semibold">
                            {person.user.id === office.me.id ? 'You' : person.user.name}
                          </span>
                          {person.status === 'huddle' && <Video size={11} className="text-coral" />}
                        </span>
                        <span className="block truncate text-[10px] text-muted">
                          {person.activity || 'Around the Studio'}
                        </span>
                      </span>
                      <span
                        className={cn('size-2 rounded-full', STATUS_META[person.status].dot)}
                        title={STATUS_META[person.status].label}
                      />
                    </button>
                  ))}
                </div>
                {recently.length > 0 && (
                  <div className="mt-3 border-t border-line-soft pt-3">
                    <p className="px-2 pb-1 text-[9px] font-semibold tracking-[0.12em] text-faint uppercase">
                      Recently around
                    </p>
                    {recently.map((person) => (
                      <button
                        key={person.user.id}
                        type="button"
                        onClick={() => setSelectedId(person.user.id)}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left opacity-65 transition-colors duration-100 hover:bg-canvas hover:opacity-100"
                      >
                        <Avatar name={person.user.name} color={person.user.avatarColor} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-medium">
                            {firstName(person.user.name)}
                          </span>
                          <span className="block truncate text-[9px] text-muted">
                            {person.activity || 'Around the Studio'}
                          </span>
                        </span>
                        <span className="shrink-0 text-[9px] text-faint">
                          {relativeTime(person.user.lastSeenAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-[20px] border border-line/80 bg-paper p-4 shadow-[var(--kora-shadow-composer)]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold">In the Studio</h2>
                  <span className="text-[10px] text-faint">live</span>
                </div>
                <div className="mt-3 space-y-3">
                  {office.activities.length === 0 && (
                    <p className="text-xs text-muted">Nothing has moved yet.</p>
                  )}
                  {office.activities.map((activity) => (
                    <ActivityRow key={activity.id} activity={activity} />
                  ))}
                </div>
              </section>

              <section className="rounded-[20px] border border-line/80 bg-paper p-4 shadow-[var(--kora-shadow-composer)]">
                <div className="flex items-center gap-2.5">
                  <Avatar name={office.me.name} color={office.me.avatarColor} size="md" online />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">Your status</p>
                    <p className="text-[10px] text-muted">
                      {mePerson ? ZONE_META[mePerson.zone]?.label ?? 'Studio' : 'Finding your spot'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-canvas p-1">
                  {(['available', 'focus', 'away'] as OfficeStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void setStatus(status)}
                      className={cn(
                        'flex h-8 items-center justify-center gap-1.5 rounded-lg text-[10px] font-semibold transition-colors duration-100',
                        mePerson?.status === status
                          ? 'bg-paper text-ink shadow-[var(--kora-shadow-composer)]'
                          : 'text-muted hover:text-ink',
                      )}
                    >
                      <span className={cn('size-1.5 rounded-full', STATUS_META[status].dot)} />
                      {STATUS_META[status].label}
                    </button>
                  ))}
                </div>

                <div className="mt-2 flex items-center gap-2 rounded-xl border border-line/80 bg-canvas px-2.5">
                  <PencilLine size={13} className="shrink-0 text-faint" />
                  <input
                    ref={activityRef}
                    value={activityDraft}
                    onChange={(event) => setActivityDraft(event.target.value)}
                    onFocus={() => setActivityFocused(true)}
                    onBlur={() => {
                      setActivityFocused(false);
                      void saveActivity();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="What are you doing?"
                    maxLength={80}
                    className="h-9 min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-faint"
                    aria-label="What are you doing?"
                  />
                </div>
                <p className="mt-2 text-[10px] leading-4 text-faint">
                  This is what your teammates see on the floor.
                </p>
              </section>
            </aside>
          </div>
        </div>
      </main>

      {callOpen && office.call && (
        <CallRoom
          key={office.call.id}
          call={office.call}
          me={office.me}
          channelName="Studio"
          onLeave={() => void leaveCall()}
        />
      )}
    </div>
  );
}

function OfficeShell({
  office,
  onlineCount,
  zoneCounts,
  activeZone,
  mobileOpen,
  onCloseMobile,
  onMove,
  onSignOut,
}: {
  office: OfficeSnapshot;
  onlineCount: number;
  zoneCounts: Map<string, number>;
  activeZone: string;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onMove: (zone: string) => void;
  onSignOut: () => void;
}) {
  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close Studio navigation"
          className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-sm md:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[300px] shrink-0 transition-transform duration-200 md:static md:z-auto md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex w-[64px] flex-col items-center bg-sidebar py-4">
          <Link to="/app" className="grid size-10 place-items-center" aria-label="Kora home">
            <svg width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <rect width="40" height="40" rx="13" fill="#EF5F3E" />
              <path d="M12 11.5v17M12 20.2l8.2-8.7M12 20.2l8.6 8.3" stroke="#FFF9F3" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M26.5 14.2c2.4 0 4 1.6 4 4.2v7.2c0 2.5-1.6 4.1-4 4.1" stroke="#FFF9F3" strokeWidth="3.4" strokeLinecap="round" />
              <circle cx="27" cy="20.2" r="1.7" fill="#151B19" />
            </svg>
          </Link>
          <div className="mt-6 flex flex-col items-center gap-1.5">
            <span className="grid size-10 place-items-center rounded-xl bg-white/12 text-white">
              <MapIcon size={18} />
            </span>
            <Link
              to="/app/$workspaceSlug/tasks"
              params={{ workspaceSlug: office.workspace.slug }}
              className="grid size-10 place-items-center rounded-xl text-sidebar-text transition hover:bg-white/10 hover:text-white"
              aria-label="Tasks"
              title="Tasks"
            >
              <ListTodo size={18} />
            </Link>
            <Link
              to="/app/$workspaceSlug"
              params={{ workspaceSlug: office.workspace.slug }}
              className="grid size-10 place-items-center rounded-xl text-sidebar-text transition hover:bg-white/10 hover:text-white"
              aria-label="Chat"
              title="Chat"
            >
              <MessageSquare size={18} />
            </Link>
            <button
              type="button"
              onClick={() => document.querySelector<HTMLInputElement>('input[aria-label="What are you doing?"]')?.focus()}
              className="grid size-10 place-items-center rounded-xl text-sidebar-text transition hover:bg-white/10 hover:text-white"
              aria-label="Set your activity"
              title="Set your activity"
            >
              <PencilLine size={18} />
            </button>
          </div>
          <div className="mt-auto flex flex-col items-center gap-2">
            <Avatar name={office.me.name} color={office.me.avatarColor} size="sm" online className="[--avatar-ring:#151b19]" />
            <button
              type="button"
              onClick={onSignOut}
              className="text-[9px] text-sidebar-text hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col bg-sidebar-raised">
          <div className="border-b border-sidebar-line px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-sidebar-bright">{office.workspace.name}</p>
                <p className="mt-0.5 text-[10px] text-sidebar-text">Studio · {onlineCount} online</p>
              </div>
              <button
                type="button"
                onClick={onCloseMobile}
                className="grid size-7 place-items-center rounded-md text-sidebar-text hover:bg-white/10 hover:text-white md:hidden"
                aria-label="Close navigation"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <nav className="scroll-dark flex-1 overflow-y-auto px-3 py-4">
            <p className="px-2 pb-2 text-[10px] font-semibold tracking-[0.14em] text-sidebar-text/75 uppercase">
              Rooms
            </p>
            <div className="space-y-1">
              {Object.entries(ZONE_META).map(([zone, meta]) => {
                const Icon = meta.icon;
                const count = zoneCounts.get(zone) ?? 0;
                return (
                  <button
                    key={zone}
                    type="button"
                    onClick={() => onMove(zone)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors duration-100',
                      activeZone === zone
                        ? 'bg-white/12 text-white'
                        : 'text-sidebar-text hover:bg-white/8 hover:text-white',
                    )}
                  >
                    <Icon size={14} className="shrink-0 opacity-80" />
                    <span className="min-w-0 flex-1 truncate">{meta.label}</span>
                    {count > 0 && (
                      <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-sidebar-bright">
                        {count}
                      </span>
                    )}
                    {activeZone === zone && <span className="size-1.5 rounded-full bg-coral" />}
                  </button>
                );
              })}
            </div>

            <p className="mt-6 px-2 pb-2 text-[10px] font-semibold tracking-[0.14em] text-sidebar-text/75 uppercase">
              Your room
            </p>
            <div className="rounded-xl border border-sidebar-line bg-sidebar/50 p-3">
              <p className="text-[11px] font-medium text-sidebar-bright">
                {ZONE_META[activeZone]?.label ?? 'Studio floor'}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-sidebar-text">
                Pick a room to move. Teammates see you arrive.
              </p>
            </div>
          </nav>

          <div className="border-t border-sidebar-line p-3">
            <Link
              to="/app/$workspaceSlug"
              params={{ workspaceSlug: office.workspace.slug }}
              className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-[12px] font-medium text-sidebar-text transition hover:bg-white/8 hover:text-white"
            >
              <ArrowLeft size={14} /> Back to channels
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}

function FloorPlan({
  people,
  meId,
  selectedId,
  activeZone,
  call,
  onSelect,
  onMove,
}: {
  people: OfficePerson[];
  meId: string;
  selectedId: string | null;
  activeZone: string;
  call: OfficeSnapshot['call'];
  onSelect: (id: string | null) => void;
  onMove: (zone: string) => void;
}) {
  return (
    <div className="relative min-h-[520px] w-full overflow-hidden rounded-[28px] border border-line/80 bg-[#faf7f1] shadow-[var(--kora-shadow-composer)] xl:h-[calc(100dvh-150px)] xl:min-h-[620px]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_16%_6%,rgba(255,255,255,.95),transparent_62%),radial-gradient(circle_at_22%_18%,rgba(232,179,74,.07),transparent_42%),radial-gradient(circle_at_82%_82%,rgba(191,228,210,.12),transparent_45%)]" />
      <div className="pointer-events-none absolute top-3 left-[22%] h-[3px] w-[24%] rounded-full bg-[#dce9ec]" />
      <div className="pointer-events-none absolute top-3 right-[20%] h-[3px] w-[16%] rounded-full bg-[#dce9ec]" />
      <div className="pointer-events-none absolute top-[9%] left-1/2 size-4 -translate-x-1/2 rounded-full border border-ink/10 bg-white/70 shadow-[0_1px_2px_rgba(23,26,26,.06)]">
        <span className="absolute top-1/2 left-1/2 h-[5px] w-px origin-bottom -translate-x-1/2 -translate-y-full bg-ink/20" />
        <span className="absolute top-1/2 left-1/2 h-[3px] w-px origin-bottom -translate-x-1/2 -translate-y-full rotate-90 bg-ink/20" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(23,26,26,.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(23,26,26,.035) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
        }}
      />

      <div className="absolute top-5 left-6 z-10">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-faint uppercase">Kora Studio</p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">The floor</h2>
      </div>
      <div className="absolute top-5 right-6 z-10 flex items-center gap-2">
        {call && (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-mint/60 px-2.5 text-[10px] font-semibold text-mint-deep">
            <span className="size-1.5 animate-pulse rounded-full bg-mint-deep" />
            Huddle live · {call.participants.length}
          </span>
        )}
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line/70 bg-paper/80 px-2.5 text-[10px] font-medium text-muted">
          <Users size={11} /> {people.filter((person) => person.online).length}
        </span>
      </div>

      <Zone area="left-[5%] top-[13%] h-[33%] w-[30%]" label="Focus" count={people.filter((person) => person.zone === 'focus').length} />
      <Zone area="right-[5%] top-[13%] h-[33%] w-[30%]" label="Huddle" count={people.filter((person) => person.zone === 'huddle').length} live={Boolean(call)} />
      <Zone area="left-[5%] bottom-[11%] h-[27%] w-[38%]" label="Lounge" count={people.filter((person) => person.zone === 'lounge').length} />
      <Zone area="right-[5%] bottom-[11%] h-[25%] w-[24%]" label="Kitchen" count={people.filter((person) => person.zone === 'kitchen').length} />

      <Furniture />

      {people.map((person) => (
        <PersonMarker
          key={person.user.id}
          person={person}
          isMe={person.user.id === meId}
          selected={selectedId === person.user.id}
          onSelect={() => onSelect(selectedId === person.user.id ? null : person.user.id)}
        />
      ))}

      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-line/70 bg-paper/90 p-1.5 shadow-[var(--kora-shadow-popover)] backdrop-blur">
        <span className="px-2 text-[9px] font-semibold tracking-[0.1em] text-faint uppercase">
          Move
        </span>
        {Object.entries(ZONE_META).map(([zone, meta]) => {
          const Icon = meta.icon;
          return (
            <button
              key={zone}
              type="button"
              onClick={() => onMove(zone)}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-[9px] px-2 text-[10px] font-medium transition-colors duration-100',
                activeZone === zone
                  ? 'bg-ink text-paper'
                  : 'text-muted hover:bg-line-soft hover:text-ink',
              )}
              title={`Move to ${meta.label}`}
            >
              <Icon size={11} /> <span className="hidden sm:inline">{meta.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Zone({
  area,
  label,
  count,
  live,
}: {
  area: string;
  label: string;
  count: number;
  live?: boolean;
}) {
  return (
    <div
      className={cn(
        'absolute rounded-[18px] border border-ink/8 bg-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_1px_2px_rgba(23,26,26,.03)]',
        live && 'border-mint-deep/25 bg-mint/10 ring-2 ring-mint-deep/10',
        area,
      )}
    >
      <span className="absolute top-2.5 left-3 flex items-center gap-1.5 rounded-full bg-paper/80 px-2 py-0.5 text-[8px] font-semibold tracking-[0.14em] text-faint uppercase backdrop-blur-sm">
        {label}
        {count > 0 && (
          <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[8px] tracking-normal text-muted">
            {count}
          </span>
        )}
        {live && <span className="size-1.5 rounded-full bg-coral animate-pulse" />}
      </span>
    </div>
  );
}

function Furniture() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* focus pods */}
      <div className="absolute top-[14.5%] left-[8%] h-[5px] w-[82px] rounded-full bg-white/80 shadow-[0_0_0_1px_rgba(23,26,26,.06)]" />
      <div className="absolute top-[14.8%] left-[11%] size-[3px] rounded-full bg-coral/50" />
      <div className="absolute top-[14.8%] left-[14%] size-[3px] rounded-full bg-gold/60" />
      <div className="absolute top-[14.8%] left-[17%] size-[3px] rounded-full bg-mint-deep/40" />
      {[
        [12, 27],
        [21, 27],
        [12, 38],
        [21, 38],
      ].map(([x, y], index) => (
        <div key={`desk-${index}`}>
          <div
            className="absolute h-[22px] w-[42px] -translate-x-1/2 -translate-y-1/2 rounded-[6px] border border-ink/8 bg-[#efe9df] shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_2px_4px_-2px_rgba(23,26,26,.18)]"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="absolute top-1/2 -left-1.5 size-1.5 -translate-y-1/2 rounded-full bg-[#d9d1c4]" />
            <span className="absolute top-1/2 -right-1.5 size-1.5 -translate-y-1/2 rounded-full bg-[#d9d1c4]" />
          </div>
          <div
            className="absolute size-2.5 -translate-x-1/2 rounded-full border border-ink/8 bg-white shadow-[0_1px_2px_rgba(23,26,26,.12)]"
            style={{ left: `${x}%`, top: `${y + 3.5}%` }}
          />
        </div>
      ))}
      <div className="absolute top-[17%] left-[31%] size-2.5 rounded-full bg-[#b8d4b3]/80 shadow-[0_0_0_4px_rgba(184,212,179,.18)]" />
      <div className="absolute bottom-[15%] left-[7%] h-[30px] w-[4px] rounded-full bg-white/80 shadow-[0_0_0_1px_rgba(23,26,26,.05)]" />

      {/* huddle table and chairs */}
      <div className="absolute top-[31%] right-[13%] h-[46px] w-[96px] -translate-y-1/2 rounded-[14px] border border-mint-deep/12 bg-[#dce7df] shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_5px_10px_-6px_rgba(23,26,26,.3)]">
        <span className="absolute top-1/2 left-2 size-2 -translate-y-1/2 rounded-full bg-mint-deep/20" />
        <span className="absolute top-1/2 right-2 size-2 -translate-y-1/2 rounded-full bg-mint-deep/20" />
      </div>
      {[
        [70, 30],
        [76, 30],
        [82, 30],
        [70, 38],
        [82, 38],
      ].map(([x, y], index) => (
        <div
          key={`huddle-chair-${index}`}
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-mint-deep/10 bg-white/90 shadow-[0_1px_2px_rgba(23,26,26,.12)]"
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      ))}
      <div className="absolute top-[15%] right-[18%] h-[5px] w-[62px] rounded-full bg-white/75 shadow-[0_0_0_1px_rgba(23,26,26,.05)]" />
      <div className="absolute top-[18%] right-[31%] size-2.5 rounded-full bg-[#b8d4b3]/80 shadow-[0_0_0_4px_rgba(184,212,179,.18)]" />

      {/* lounge */}
      <div className="absolute bottom-[16%] left-[11%] h-[70px] w-[104px] rounded-[18px] bg-mint/20 ring-1 ring-mint-deep/10" />
      <div className="absolute bottom-[18%] left-[13%] h-[24px] w-[58px] rounded-[9px] border border-mint-deep/12 bg-[#dce7df] shadow-[0_3px_6px_-3px_rgba(23,26,26,.25)]">
        <span className="absolute inset-x-1 top-1 h-[2px] rounded-full bg-white/70" />
        <span className="absolute top-1 bottom-1 left-1/2 w-px bg-mint-deep/10" />
      </div>
      <div className="absolute bottom-[18%] left-[18%] h-[8px] w-[8px] rounded-[3px] bg-[#f5e7cf] shadow-[0_0_0_1px_rgba(23,26,26,.05)]" />
      <div className="absolute bottom-[23%] left-[31%] size-7 rounded-full border border-mint-deep/10 bg-[#efe9df] shadow-[0_2px_4px_-2px_rgba(23,26,26,.2)]" />
      <div className="absolute bottom-[24%] left-[34%] size-2 rounded-full bg-[#f5e7cf]" />
      <div className="absolute bottom-[21%] left-[7%] h-[42px] w-[5px] rounded-[2px] bg-[#e6d8c7] shadow-[0_1px_2px_rgba(23,26,26,.08)]">
        <span className="absolute inset-x-0 top-1/3 h-px bg-white/60" />
        <span className="absolute inset-x-0 top-2/3 h-px bg-white/60" />
      </div>
      <div className="absolute bottom-[28%] left-[36%] size-3 rounded-full bg-[#b8d4b3]/90 shadow-[0_0_0_5px_rgba(184,212,179,.18)]" />
      <div className="absolute bottom-[13%] left-[47%] size-2.5 rounded-full bg-[#b8d4b3]/80 shadow-[0_0_0_4px_rgba(184,212,179,.18)]" />

      {/* central collaboration table */}
      <div className="absolute top-[56%] left-[53%] h-[64px] w-[116px] rounded-[18px] bg-sage/25 ring-1 ring-ink/5" />
      <div className="absolute top-[58%] left-[56%] h-[22px] w-[74px] rounded-[8px] border border-ink/8 bg-[#efe9df] shadow-[0_3px_6px_-3px_rgba(23,26,26,.2)]" />
      <div className="absolute top-[62%] left-[59%] size-2 rounded-full bg-[#f5e7cf]" />
      <div className="absolute top-[63%] left-[64%] size-2 rounded-full bg-[#f5e7cf]" />

      {/* kitchen */}
      <div className="absolute right-[10%] bottom-[19%] h-[18px] w-[74px] rounded-[6px] border border-ink/8 bg-[#efe9df] shadow-[0_2px_4px_-2px_rgba(23,26,26,.18)]" />
      <div className="absolute right-[10%] bottom-[25%] h-[9px] w-[12px] rounded-[3px] bg-white/80 ring-1 ring-ink/8" />
      <div className="absolute right-[20%] bottom-[24%] h-[8px] w-[7px] rounded-[2px] bg-[#d9d1c4]" />
      <div className="absolute right-[15%] bottom-[24%] h-[6px] w-[12px] rounded-full bg-[#dce9ec]" />
      <div className="absolute right-[20%] bottom-[16%] size-2.5 rounded-full border border-ink/8 bg-white/90" />
      <div className="absolute right-[14%] bottom-[16%] size-2.5 rounded-full border border-ink/8 bg-white/90" />
      <div className="absolute right-[6%] bottom-[23%] size-2.5 rounded-full bg-[#b8d4b3]/80 shadow-[0_0_0_4px_rgba(184,212,179,.18)]" />

      {/* studio floor */}
      <div className="absolute top-[57%] left-[58%] h-[20px] w-[34px] rounded-[6px] border border-ink/8 bg-[#efe9df] shadow-[0_2px_4px_-2px_rgba(23,26,26,.15)]" />
      <div className="absolute top-[49%] left-[62%] size-2.5 rounded-full bg-[#b8d4b3]/80 shadow-[0_0_0_4px_rgba(184,212,179,.18)]" />
    </div>
  );
}

function PersonMarker({
  person,
  isMe,
  selected,
  onSelect,
}: {
  person: OfficePerson;
  isMe: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = STATUS_META[person.status];
  const offline = !person.online;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group absolute z-10 -translate-x-1/2 -translate-y-1/2 text-left transition-[left,top,opacity] duration-300 ease-out',
        offline && 'opacity-60',
        selected && 'z-20',
      )}
      style={{ left: `${person.x}%`, top: `${person.y}%` }}
      aria-label={`${person.user.name}, ${person.activity || status.label}`}
    >
      <span
        className={cn(
          'flex items-center gap-2 rounded-[14px] border border-line/70 bg-paper/95 py-1 pr-2.5 pl-1 shadow-[0_5px_14px_-8px_rgba(23,26,26,.35)] backdrop-blur-sm transition-[transform,border-color,box-shadow] duration-150 ease-out group-hover:-translate-y-0.5 group-hover:border-ink/20',
          isMe && 'border-coral/25',
          selected && 'border-coral/40 ring-2 ring-coral/20',
        )}
      >
        <Avatar
          name={person.user.name}
          color={person.user.avatarColor}
          size={isMe ? 'md' : 'sm'}
          online={person.online}
          ring
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1">
            <span className="max-w-[86px] truncate text-[10px] font-semibold">
              {isMe ? 'You' : firstName(person.user.name)}
            </span>
            <span className={cn('size-1.5 shrink-0 rounded-full', status.dot)} />
            {person.status === 'huddle' && <Video size={9} className="shrink-0 text-coral" />}
            {offline && (
              <span className="shrink-0 text-[8px] font-medium text-faint">
                {relativeTime(person.user.lastSeenAt)}
              </span>
            )}
          </span>
          <span className="mt-0.5 block max-w-[118px] truncate text-[9px] text-muted">
            {person.activity || status.label}
          </span>
        </span>
      </span>
    </button>
  );
}

function MobileFloor({
  people,
  meId,
  activeZone,
  onSelect,
  onMove,
}: {
  people: OfficePerson[];
  meId: string;
  activeZone: string;
  onSelect: (id: string) => void;
  onMove: (zone: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-[22px] border border-line/80 bg-paper p-4 shadow-[var(--kora-shadow-composer)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] text-faint uppercase">Kora Studio</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">The floor</h2>
          </div>
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line/70 bg-canvas px-2.5 text-[10px] font-medium text-muted">
            <Users size={11} /> {people.filter((person) => person.online).length} online
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {Object.entries(ZONE_META).map(([zone, meta]) => {
            const Icon = meta.icon;
            const zonePeople = people.filter((person) => person.zone === zone);
            return (
              <section key={zone} className={cn('rounded-[16px] border border-line/70 bg-canvas/60 p-3', activeZone === zone && 'border-coral/25 bg-coral-soft/30')}>
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className="text-muted" />
                  <span className="text-[10px] font-semibold tracking-[0.1em] text-muted uppercase">{meta.label}</span>
                  <span className="ml-auto text-[9px] text-faint">{zonePeople.length}</span>
                </div>
                <div className="mt-2 space-y-1">
                  {zonePeople.length === 0 && <p className="px-1 py-1 text-[11px] text-faint">Quiet for now.</p>}
                  {zonePeople.map((person) => (
                    <button
                      key={person.user.id}
                      type="button"
                      onClick={() => onSelect(person.user.id)}
                      className={cn('flex w-full items-center gap-2.5 rounded-xl bg-paper/80 px-2 py-1.5 text-left', !person.online && 'opacity-60')}
                    >
                      <Avatar name={person.user.name} color={person.user.avatarColor} size="sm" online={person.online} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[11px] font-semibold">{person.user.id === meId ? 'You' : firstName(person.user.name)}</span>
                          <span className={cn('size-1.5 rounded-full', STATUS_META[person.status].dot)} />
                          {person.status === 'huddle' && <Video size={10} className="text-coral" />}
                        </span>
                        <span className="block truncate text-[10px] text-muted">{person.activity || 'Around the Studio'}</span>
                      </span>
                      {!person.online && <span className="text-[9px] text-faint">{relativeTime(person.user.lastSeenAt)}</span>}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-[16px] border border-line/70 bg-paper/90 p-1.5 shadow-[var(--kora-shadow-composer)]">
        {Object.entries(ZONE_META).map(([zone, meta]) => {
          const Icon = meta.icon;
          return (
            <button
              key={zone}
              type="button"
              onClick={() => onMove(zone)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[10px] font-medium transition-colors duration-100',
                activeZone === zone ? 'bg-ink text-paper' : 'text-muted hover:bg-line-soft hover:text-ink',
              )}
            >
              <Icon size={11} /> {meta.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PersonCard({
  person,
  onClose,
  onMessage,
}: {
  person: OfficePerson;
  onClose: () => void;
  onMessage: () => void;
}) {
  return (
    <section className="animate-pop rounded-[20px] border border-line/80 bg-paper p-4 shadow-[var(--kora-shadow-popover)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Avatar name={person.user.name} color={person.user.avatarColor} size="lg" online={person.online} />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{person.user.name}</p>
            <p className="truncate text-[10px] text-muted">{person.user.title || 'Teammate'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 place-items-center rounded-lg text-faint transition hover:bg-line-soft hover:text-ink active:scale-[0.96]"
          aria-label="Close profile"
        >
          <X size={14} />
        </button>
      </div>
      <div className={cn('mt-3 rounded-xl px-3 py-2', STATUS_META[person.status].bg)}>
        <p className={cn('text-[10px] font-semibold', STATUS_META[person.status].text)}>
          {STATUS_META[person.status].label}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-soft">{person.activity || 'Around the Studio'}</p>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-muted">
        <MapPin size={11} /> {ZONE_META[person.zone]?.label ?? 'Studio floor'}
        <span className="text-faint">·</span>
        <span>{person.online ? 'Here now' : `Last seen ${relativeTime(person.user.lastSeenAt)}`}</span>
      </div>
      <button
        type="button"
        onClick={onMessage}
        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border border-line text-[11px] font-semibold transition hover:border-ink/25 hover:bg-canvas active:scale-[0.98]"
      >
        <MessageSquare size={14} /> Message
      </button>
    </section>
  );
}

function ActivityRow({ activity }: { activity: OfficeActivity }) {
  const icon =
    activity.kind === 'moved' ? (
      <MapPin size={11} />
    ) : activity.kind === 'call' ? (
      <Video size={11} />
    ) : activity.kind === 'status' ? (
      <span className="size-1.5 rounded-full bg-coral" />
    ) : (
      <PencilLine size={11} />
    );
  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={activity.user.name} color={activity.user.avatarColor} size="xs" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-4 text-ink-soft">
          <span className="font-semibold">{firstName(activity.user.name)}</span> {activity.detail}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[9px] text-faint">
          <span className="text-faint">{icon}</span>
          <span>{relativeTime(activity.createdAt)}</span>
        </p>
      </div>
    </div>
  );
}
