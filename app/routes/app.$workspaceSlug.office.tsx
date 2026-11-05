import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import {
  Coffee,
  Map as MapIcon,
  MapPin,
  Menu,
  MessageSquare,
  PencilLine,
  Phone,
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
import { AppRail } from '../components/app-rail';
import { CallRoom } from '../components/call-room';
import { CreatureBadge, type CreatureMood } from '../components/studio/creature';
import { placePeople, StudioScene } from '../components/studio/scene';
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
  floor: {
    label: 'Studio floor',
    short: 'Floor',
    icon: MapIcon,
    color: 'var(--mint-deep)',
  },
  focus: {
    label: 'Focus room',
    short: 'Focus',
    icon: Sparkles,
    color: 'var(--gold)',
  },
  lounge: { label: 'Lounge', short: 'Lounge', icon: Coffee, color: '#b07aa1' },
  huddle: {
    label: 'Huddle room',
    short: 'Huddle',
    icon: Video,
    color: 'var(--coral)',
  },
  kitchen: {
    label: 'Kitchen',
    short: 'Kitchen',
    icon: Coffee,
    color: '#6c8e3b',
  },
};

const STATUS_META: Record<OfficeStatus, { label: string; dot: string; text: string; bg: string }> =
  {
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

function moodOf(person: OfficePerson): CreatureMood {
  return person.online ? person.status : 'offline';
}

function statusDotOf(person: OfficePerson) {
  return person.online ? STATUS_META[person.status].dot : 'bg-line';
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
    ? (office.people.find((person) => person.user.id === selectedId) ?? null)
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
  const activeZone = mePerson?.zone ?? 'floor';

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

  async function update(patch: { zone?: string; activity?: string; status?: OfficeStatus }) {
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
      await update({
        status,
        zone: mePerson.zone === 'focus' ? undefined : 'focus',
      });
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
    await update({
      status: 'available',
      activity: 'Around the Studio',
      zone: 'floor',
    });
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
        activeZone={activeZone}
        mobileOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        onMove={(zone) => void move(zone)}
        onSignOut={() => void signOut()}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-paper/85 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-line-soft max-sm:size-11 md:hidden"
              aria-label="Open Studio navigation"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">Studio</h1>
              <p className="truncate text-[12px] text-muted">
                {online.length} {online.length === 1 ? 'person' : 'people'} in the room
                {office.call ? ' · huddle live' : ' · quiet'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => (joinedCall ? setCallOpen(true) : void joinCall())}
              aria-label={
                joinedCall ? 'Return to call' : office.call ? 'Join huddle' : 'Start huddle'
              }
              className={cn(
                'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-out max-sm:size-11 max-sm:px-0',
                joinedCall
                  ? 'bg-mint/50 text-mint-deep hover:bg-mint/70'
                  : office.call
                    ? 'bg-coral text-paper hover:bg-coral-deep'
                    : 'border border-line text-ink-soft hover:border-ink/20 hover:bg-canvas',
              )}
            >
              {joinedCall ? <Video size={16} /> : <Phone size={16} />}
              <span className="hidden sm:inline">
                {joinedCall ? 'Return to call' : office.call ? 'Join huddle' : 'Start huddle'}
              </span>
              {office.call && (
                <span className="rounded-full bg-paper/25 px-1.5 text-[11px] font-semibold tabular-nums max-sm:hidden">
                  {office.call.participants.length}
                </span>
              )}
            </button>
          </div>
        </header>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 p-4 md:p-6 xl:flex-row">
            <section className="flex min-w-0 flex-1 flex-col self-start max-xl:w-full rounded-2xl border border-line/80 bg-paper shadow-[var(--kora-shadow-composer)]">
              <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">
                    {office.workspace.name}
                  </p>
                  <h2 className="mt-1 text-[20px] leading-none font-semibold tracking-[-0.02em]">
                    The floor
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {office.call && (
                    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-coral-soft px-2 text-[11px] font-semibold text-coral-deep">
                      <span className="studio-live size-1.5 rounded-full bg-coral" />
                      Huddle live · {office.call.participants.length}
                    </span>
                  )}
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line px-2 text-[11px] font-semibold text-muted tabular-nums">
                    <Users size={12} /> {online.length} here
                  </span>
                </div>
              </div>

              <div className="px-2 sm:px-4">
                <StudioScene
                  people={office.people}
                  meId={office.me.id}
                  selectedId={selectedId}
                  call={office.call}
                  activeZone={activeZone}
                  zones={ZONE_META}
                  onSelect={setSelectedId}
                  onMove={(zone) => void move(zone)}
                  statusLabel={(person) =>
                    person.online ? STATUS_META[person.status].label : 'Offline'
                  }
                  statusDot={statusDotOf}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line-soft px-4 py-3 sm:px-6">
                <p className="text-[12px] text-muted max-sm:hidden">
                  Click a room to move. Click a teammate to see what they are up to.
                </p>
                <p className="text-[12px] text-muted sm:hidden">
                  You are in the {ZONE_META[activeZone]?.label ?? 'Studio floor'}.
                </p>
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
                  {(['available', 'focus', 'away', 'huddle'] as OfficeStatus[]).map((status) => (
                    <li key={status} className="flex items-center gap-1.5">
                      <span className={cn('size-1.5 rounded-full', STATUS_META[status].dot)} />
                      {status === 'huddle' ? 'Huddle' : STATUS_META[status].label}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[320px]">
              {selected && selected.user.id !== office.me.id && (
                <PersonCard
                  person={selected}
                  onClose={() => setSelectedId(null)}
                  onMessage={() => void messagePerson(selected.user.id)}
                />
              )}

              <section className="rounded-2xl border border-line/80 bg-paper p-4 shadow-[var(--kora-shadow-composer)]">
                <div className="flex items-center gap-3">
                  <CreatureBadge
                    id={office.me.id}
                    tint={office.me.avatarColor}
                    mood={mePerson ? moodOf(mePerson) : 'available'}
                    size={36}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">Your status</p>
                    <p className="truncate text-[12px] text-muted">
                      {mePerson
                        ? (ZONE_META[mePerson.zone]?.label ?? 'Studio')
                        : 'Finding your spot'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-canvas p-1">
                  {(['available', 'focus', 'away'] as OfficeStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void setStatus(status)}
                      aria-pressed={mePerson?.status === status}
                      className={cn(
                        'flex h-8 items-center justify-center gap-1.5 rounded-md text-[12px] font-semibold transition-colors duration-100',
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

                <label className="mt-2 flex h-9 items-center max-sm:h-11 gap-2 rounded-lg border border-line/80 bg-canvas px-3 focus-within:border-ink/25">
                  <PencilLine size={14} className="shrink-0 text-faint" />
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
                    className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint max-sm:text-[16px]"
                    aria-label="What are you doing?"
                  />
                </label>
              </section>

              <MobileRooms
                people={office.people}
                meId={office.me.id}
                activeZone={activeZone}
                onSelect={setSelectedId}
                onMove={(zone) => void move(zone)}
              />

              <section className="hidden rounded-2xl border border-line/80 bg-paper p-4 shadow-[var(--kora-shadow-composer)] sm:block">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold">Here now</h2>
                  <span className="text-[12px] text-muted tabular-nums">
                    {online.length} online
                  </span>
                </div>
                <div className="mt-2 -mx-2">
                  {online.length === 0 && (
                    <p className="mx-2 rounded-lg bg-canvas px-3 py-4 text-center text-[12px] leading-5 text-muted">
                      The room is quiet. Set your status and invite someone in.
                    </p>
                  )}
                  {online.map((person) => (
                    <PersonRow
                      key={person.user.id}
                      person={person}
                      isMe={person.user.id === office.me.id}
                      selected={selectedId === person.user.id}
                      onSelect={() => setSelectedId(person.user.id)}
                    />
                  ))}
                </div>
                {recently.length > 0 && (
                  <div className="mt-2 border-t border-line-soft pt-2">
                    <p className="pt-1 pb-1 text-[11px] font-semibold tracking-[0.12em] text-faint uppercase">
                      Recently around
                    </p>
                    <div className="-mx-2">
                      {recently.map((person) => (
                        <PersonRow
                          key={person.user.id}
                          person={person}
                          isMe={false}
                          selected={selectedId === person.user.id}
                          onSelect={() => setSelectedId(person.user.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-line/80 bg-paper p-4 shadow-[var(--kora-shadow-composer)]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold">In the Studio</h2>
                  <span className="flex items-center gap-1.5 text-[12px] text-muted">
                    <span className="studio-live size-1.5 rounded-full bg-mint-deep" /> Live
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {office.activities.length === 0 && (
                    <p className="text-[12px] text-muted">Nothing has moved yet.</p>
                  )}
                  {office.activities.slice(0, 8).map((activity) => (
                    <ActivityRow key={activity.id} activity={activity} />
                  ))}
                </div>
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
        <AppRail
          workspaceSlug={office.workspace.slug}
          active="studio"
          me={office.me}
          onSignOut={onSignOut}
        />

        <div className="flex min-w-0 flex-1 flex-col bg-sidebar-raised">
          <div className="border-b border-sidebar-line px-4 py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-sidebar-bright">
                  {office.workspace.name}
                </p>
                <p className="mt-0.5 text-[10px] text-sidebar-text">
                  Studio · {onlineCount} online
                </p>
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

        </div>
      </aside>
    </>
  );
}

function PersonRow({
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
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors duration-100 hover:bg-canvas',
        selected && 'bg-canvas',
      )}
    >
      <CreatureBadge
        id={person.user.id}
        tint={person.user.avatarColor}
        mood={moodOf(person)}
        size={32}
        className={cn(!person.online && 'opacity-60')}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn('truncate text-[13px] font-semibold', !person.online && 'text-muted')}
          >
            {isMe ? 'You' : person.user.name}
          </span>
          {person.status === 'huddle' && person.online && (
            <Video size={12} className="shrink-0 text-coral" />
          )}
        </span>
        <span className="block truncate text-[12px] text-muted">
          {person.online
            ? `${ZONE_META[person.zone]?.short ?? 'Floor'} · ${person.activity || 'Around the Studio'}`
            : `Last seen ${relativeTime(person.user.lastSeenAt)}`}
        </span>
      </span>
      <span
        className={cn('size-2 shrink-0 rounded-full', statusDotOf(person))}
        title={person.online ? STATUS_META[person.status].label : 'Offline'}
      />
    </button>
  );
}

// Phone: the scene above is a picture; this per-room list is where you act.
function MobileRooms({
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
  const placed = placePeople(people);
  return (
    <section className="rounded-2xl border border-line/80 bg-paper p-4 shadow-[var(--kora-shadow-composer)] sm:hidden">
      <h2 className="text-[13px] font-semibold">Rooms</h2>
      <div className="mt-2 divide-y divide-line-soft">
        {Object.entries(ZONE_META).map(([zone, meta]) => {
          const Icon = meta.icon;
          const here = placed
            .filter((entry) => entry.seat.zone === zone)
            .map((entry) => entry.person);
          const active = activeZone === zone;
          return (
            <div key={zone} className="py-3">
              <div className="flex h-8 items-center gap-2">
                <Icon size={14} className="shrink-0 text-muted" />
                <span className="text-[13px] font-semibold">{meta.label}</span>
                <span className="text-[12px] text-faint tabular-nums">{here.length}</span>
                {active ? (
                  <span className="ml-auto inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12px] font-semibold text-paper">
                    You are here
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onMove(zone)}
                    className="ml-auto inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12px] font-semibold text-ink-soft hover:bg-canvas"
                  >
                    Move here
                  </button>
                )}
              </div>
              {here.length > 0 && (
                <div className="mt-2 -mx-2">
                  {here.map((person) => (
                    <PersonRow
                      key={person.user.id}
                      person={person}
                      isMe={person.user.id === meId}
                      selected={false}
                      onSelect={() => onSelect(person.user.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
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
  const status = STATUS_META[person.status];
  return (
    <section className="animate-pop rounded-2xl border border-line/80 bg-paper p-4 shadow-[var(--kora-shadow-popover)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <CreatureBadge
            id={person.user.id}
            tint={person.user.avatarColor}
            mood={moodOf(person)}
            size={44}
          />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{person.user.name}</p>
            <p className="truncate text-[12px] text-muted">{person.user.title || 'Teammate'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 place-items-center rounded-lg text-faint transition hover:bg-line-soft hover:text-ink"
          aria-label="Close profile"
        >
          <X size={16} />
        </button>
      </div>
      <div className={cn('mt-4 rounded-lg px-3 py-2', person.online ? status.bg : 'bg-line-soft')}>
        <p className={cn('text-[12px] font-semibold', person.online ? status.text : 'text-muted')}>
          {person.online ? status.label : 'Offline'}
        </p>
        <p className="mt-0.5 text-[13px] text-ink-soft">{person.activity || 'Around the Studio'}</p>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
        <MapPin size={12} /> {ZONE_META[person.zone]?.label ?? 'Studio floor'}
        <span className="text-faint">·</span>
        <span>
          {person.online ? 'Here now' : `Last seen ${relativeTime(person.user.lastSeenAt)}`}
        </span>
      </div>
      <button
        type="button"
        onClick={onMessage}
        className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-ink text-[13px] font-semibold text-paper transition hover:bg-ink-soft"
      >
        <MessageSquare size={16} /> Message
      </button>
    </section>
  );
}

function ActivityRow({ activity }: { activity: OfficeActivity }) {
  const icon =
    activity.kind === 'moved' ? (
      <MapPin size={12} />
    ) : activity.kind === 'call' ? (
      <Video size={12} />
    ) : activity.kind === 'status' ? (
      <span className="size-1.5 rounded-full bg-coral" />
    ) : (
      <PencilLine size={12} />
    );
  return (
    <div className="flex items-start gap-3">
      <CreatureBadge
        id={activity.user.id}
        tint={activity.user.avatarColor}
        mood="available"
        size={24}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-5 text-ink-soft">
          <span className="font-semibold">{firstName(activity.user.name)}</span> {activity.detail}
        </p>
        <p className="flex items-center gap-1.5 text-[12px] text-faint">
          {icon}
          <span>{relativeTime(activity.createdAt)}</span>
        </p>
      </div>
    </div>
  );
}
