import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import {
  ArrowRight,
  Check,
  FileText,
  Hash,
  MessageSquareText,
  Phone,
  Search,
  Sparkles,
  Video,
  Zap,
} from 'lucide-react';
import { getSessionUserFn } from '../lib/auth';
import { Avatar } from '../components/avatar';
import { LogoMark, Wordmark } from '../components/logo';
import { RichText } from '../components/rich-text';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../lib/demo';

export const Route = createFileRoute('/')({
  loader: async () => {
    const user = await getSessionUserFn();
    if (user) throw redirect({ to: '/app' });
    return { signedOut: true };
  },
  component: LandingPage,
});

const demoMessages = [
  {
    name: 'Amina Diallo',
    color: '#5B8DEF',
    time: '9:41',
    text: 'Call overlay is in. Camera, screen share, the whole thing.',
    reactions: ['🎉 3', '🔥 2'],
  },
  {
    name: 'Kwame Mensah',
    color: '#18A999',
    time: '9:42',
    text: 'Joining. Give me two seconds.',
    reactions: [],
  },
  {
    name: 'Alade Yessoufou',
    color: '#D97757',
    time: '9:43',
    text: 'Threads are live too. Reply counts update without a refresh.',
    reactions: ['👍 4'],
    thread: '3 replies · last 2m',
  },
];

function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-canvas">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(ellipse_at_top,rgba(191,228,210,0.5),transparent_62%)]" />

      <header className="relative mx-auto flex w-full max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8">
        <Wordmark />
        <nav className="hidden items-center gap-7 text-[13px] font-medium text-muted md:flex">
          <a href="#product" className="transition hover:text-ink">
            Product
          </a>
          <a href="#why" className="transition hover:text-ink">
            Why Kora
          </a>
          <a href="#stack" className="transition hover:text-ink">
            Stack
          </a>
        </nav>
        <div className="flex items-center gap-2.5">
          <Link
            to="/login"
            className="hidden h-9 items-center rounded-xl px-3 text-[13px] font-semibold text-ink-soft transition hover:bg-line-soft sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="group inline-flex h-9 items-center gap-2 rounded-full bg-ink py-1 pr-1 pl-3.5 text-[13px] font-semibold text-paper transition-colors duration-150 hover:bg-ink-soft"
          >
            Start free
            <span className="grid size-7 place-items-center rounded-full bg-white/10 transition-transform duration-150 ease-out group-hover:translate-x-0.5">
              <ArrowRight size={13} />
            </span>
          </Link>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto grid w-full max-w-[1180px] items-center gap-12 px-5 pt-14 pb-20 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:pt-20 lg:pb-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-paper/80 px-3 py-1.5 text-[11px] font-medium text-muted backdrop-blur">
              <Sparkles size={12} className="text-coral" />
              Team chat, rebuilt on the edge
            </div>
            <h1 className="mt-6 max-w-[620px] font-display text-[58px] leading-[0.93] tracking-[-0.03em] text-balance sm:text-[76px]">
              The room where the work <span className="text-coral italic">actually</span> happens.
            </h1>
            <p className="mt-6 max-w-lg text-[15px] leading-7 text-muted">
              Kora brings channels, threads, files, search, and one-click video huddles into one
              calm place. No plugin maze. No context lost between tabs.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="group inline-flex h-12 items-center gap-2 rounded-full bg-coral py-1 pr-1.5 pl-5 text-sm font-semibold text-white shadow-[0_14px_30px_-14px_rgba(239,95,62,0.8)] transition-colors duration-150 hover:bg-coral-deep"
              >
                Create your workspace
                <span className="grid size-9 place-items-center rounded-full bg-white/16 transition-transform duration-150 ease-out group-hover:translate-x-0.5">
                  <ArrowRight size={16} />
                </span>
              </Link>
              <Link
                to="/login"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-ink/15 bg-paper px-6 text-sm font-semibold transition-colors duration-150 hover:border-ink/30 hover:bg-white"
              >
                Open the demo
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Check size={13} className="text-mint-deep" /> Demo: {DEMO_EMAIL}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check size={13} className="text-mint-deep" /> Password: {DEMO_PASSWORD}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check size={13} className="text-mint-deep" /> No card
              </span>
            </div>
          </div>

          <ProductPreview />
        </section>

        <section id="product" className="border-y border-line bg-paper/60">
          <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 lg:py-24">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.12em] text-coral-deep uppercase">
                  The daily loop
                </p>
                <h2 className="mt-2 max-w-xl text-[34px] leading-[1.05] font-semibold tracking-[-0.04em] sm:text-[44px]">
                  Everything a team needs, in one room.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-muted">
                The core five, done properly. No eighty-tab setup, no bots bolted on, no dashboard
                where the conversation should be.
              </p>
            </div>

            <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <Feature
                icon={<Hash size={19} />}
                title="Channels that stay legible"
                body="Public or private, with unread counts that tell you where the action is before you open anything."
                className="lg:col-span-2"
              />
              <Feature
                icon={<MessageSquareText size={19} />}
                title="Threads"
                body="Keep the decision next to the message. Reply counts update without a refresh."
              />
              <Feature
                icon={<Video size={19} />}
                title="Huddles in one click"
                body="Camera, mic, screen share, and a participant grid. WebRTC, no meeting link."
              />
              <Feature
                icon={<FileText size={19} />}
                title="Files on R2"
                body="Drop an image or a document. It lands in the thread with a preview and a clean download."
              />
              <Feature
                icon={<Search size={19} />}
                title="Search the whole workspace"
                body="Cmd K finds the message, the person, and the channel. No scrolling archaeology."
              />
            </div>
          </div>
        </section>

        <section id="why" className="mx-auto grid w-full max-w-[1180px] gap-10 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-28">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-coral-deep uppercase">
              Why another chat app
            </p>
            <h2 className="mt-2 text-[36px] leading-[1.02] font-semibold tracking-[-0.04em] sm:text-[48px]">
              Slack shaped the category. It did not finish the job.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-muted">
              Threads still hide. Calls still need a link. Search still makes you leave the room.
              Kora is a smaller, sharper take: a workspace your team can run itself, on an edge
              stack that costs less than the coffee budget.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              {['Own your data', 'No per-seat tax', 'Runs on your Cloudflare account'].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] font-medium text-ink-soft"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                number: '01',
                title: 'The conversation is the product',
                body: 'No feed, no cards, no widgets competing with the message. Channels, threads, and people.',
              },
              {
                number: '02',
                title: 'Calls without ceremony',
                body: 'The huddle button is in the channel header. One click joins the room already talking.',
              },
              {
                number: '03',
                title: 'A stack you can read',
                body: 'Void, TanStack Start, D1, R2, and Workers. One repo, no mystery services.',
              },
              {
                number: '04',
                title: 'Designed to disappear',
                body: 'Quiet surfaces, strong hierarchy, keyboard first. The tool should not be the work.',
              },
            ].map((item) => (
              <div key={item.number} className="rounded-2xl border border-line bg-paper p-5">
                <span className="font-mono text-[10px] text-coral-deep">{item.number}</span>
                <h3 className="mt-3 text-[15px] font-semibold tracking-[-0.01em]">{item.title}</h3>
                <p className="mt-2 text-[12.5px] leading-6 text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="stack" className="border-y border-line bg-sidebar text-sidebar-bright">
          <div className="mx-auto grid w-full max-w-[1180px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_0.9fr] lg:py-24">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-[#9fe4c8] uppercase">
                <Zap size={13} /> The edge stack
              </p>
              <h2 className="mt-3 max-w-xl text-[36px] leading-[1.02] font-semibold tracking-[-0.04em] sm:text-[48px]">
                Small surface. Global reach.
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-sidebar-text">
                Kora is a Void app on TanStack Start. Messages, sessions, and call state live in D1.
                Files sit in R2. Every request runs on Cloudflare Workers, close to the person
                typing.
              </p>
              <Link
                to="/signup"
                className="group mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-coral py-1 pr-1 pl-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-coral-deep"
              >
                Start your workspace
                <span className="grid size-8 place-items-center rounded-full bg-white/16 transition-transform duration-150 ease-out group-hover:translate-x-0.5">
                  <ArrowRight size={14} />
                </span>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 self-center">
              {[
                { value: '0', label: 'servers to patch' },
                { value: '1', label: 'repo for the whole app' },
                { value: 'D1', label: 'messages and sessions' },
                { value: 'R2', label: 'files and images' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-sidebar-line bg-white/[0.03] p-5">
                  <p className="font-display text-4xl tracking-[-0.02em]">{stat.value}</p>
                  <p className="mt-1.5 text-[11px] text-sidebar-text">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1180px] px-5 py-20 sm:px-8 lg:py-28">
          <div className="relative overflow-hidden rounded-[32px] border border-line bg-paper px-6 py-12 text-center sm:px-12 sm:py-16">
            <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[520px] -translate-x-1/2 rounded-full bg-mint/40 blur-3xl" />
            <div className="relative">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-coral-deep uppercase">
                Ready when you are
              </p>
              <h2 className="mx-auto mt-3 max-w-2xl font-display text-[44px] leading-[0.98] tracking-[-0.02em] sm:text-[62px]">
                Open a room. Invite the team. Go.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted">
                The demo workspace is seeded with four teammates and a few days of conversation.
                Poke at it before you make your own.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link
                  to="/signup"
                  className="group inline-flex h-12 items-center gap-2 rounded-full bg-ink py-1 pr-1.5 pl-5 text-sm font-semibold text-paper transition-colors duration-150 hover:bg-ink-soft"
                >
                  Create an account
                  <span className="grid size-9 place-items-center rounded-full bg-white/10 transition-transform duration-150 ease-out group-hover:translate-x-0.5">
                    <ArrowRight size={16} />
                  </span>
                </Link>
                <Link
                  to="/login"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-line px-6 text-sm font-semibold transition-colors duration-150 hover:border-ink/30 hover:bg-white"
                >
                  <Phone size={16} /> Try the demo
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2.5">
            <LogoMark size={26} />
            <span className="text-sm font-semibold">Kora</span>
            <span className="text-xs text-faint">Team chat for people who ship.</span>
          </div>
          <div className="flex items-center gap-5 text-xs text-muted">
            <a href="#product" className="hover:text-ink">
              Product
            </a>
            <a href="#why" className="hover:text-ink">
              Why Kora
            </a>
            <a href="#stack" className="hover:text-ink">
              Stack
            </a>
            <Link to="/login" className="hover:text-ink">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-paper p-5 ${className ?? ''}`}
    >
      <span className="grid size-10 place-items-center rounded-xl bg-coral-soft text-coral-deep">
        {icon}
      </span>
      <h3 className="mt-4 text-[16px] font-semibold tracking-[-0.02em]">{title}</h3>
      <p className="mt-2 max-w-md text-[13px] leading-6 text-muted">{body}</p>
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="absolute -inset-4 rounded-[36px] bg-gradient-to-br from-mint/50 via-transparent to-coral/10 blur-xl" />
      <div className="relative overflow-hidden rounded-[26px] border border-ink/10 bg-paper shadow-[0_40px_100px_-40px_rgba(23,26,26,0.5)]">
        <div className="flex items-center gap-1.5 border-b border-line bg-canvas/80 px-4 py-2.5">
          <span className="size-2 rounded-full bg-coral/60" />
          <span className="size-2 rounded-full bg-gold/70" />
          <span className="size-2 rounded-full bg-mint-deep/50" />
          <span className="mx-auto rounded-md bg-paper px-3 py-1 font-mono text-[9px] text-faint">
            kora.app/app/kora-studio/general
          </span>
        </div>
        <div className="flex h-[430px]">
          <div className="hidden w-16 flex-col items-center gap-3 bg-sidebar py-4 sm:flex">
            <LogoMark size={30} />
            <span className="mt-3 grid size-9 place-items-center rounded-xl bg-white/10 text-white">
              <Hash size={15} />
            </span>
            <span className="grid size-9 place-items-center rounded-xl text-sidebar-text">
              <Search size={15} />
            </span>
            <span className="grid size-9 place-items-center rounded-xl text-sidebar-text">
              <Phone size={15} />
            </span>
          </div>
          <div className="hidden w-40 flex-col bg-sidebar-raised px-2.5 py-3 sm:flex">
            <p className="px-1 text-[11px] font-semibold text-sidebar-bright">Kora Studio</p>
            <p className="mt-0.5 px-1 text-[8px] text-sidebar-text">4 members · 5 conversations</p>
            <p className="mt-4 px-1 text-[8px] font-semibold tracking-[0.1em] text-sidebar-text uppercase">
              Channels
            </p>
            {['general', 'product', 'design', 'random'].map((channel, index) => (
              <span
                key={channel}
                className={`mt-0.5 flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px] ${
                  index === 0 ? 'bg-white/12 text-white' : 'text-sidebar-text'
                }`}
              >
                <Hash size={10} /> {channel}
              </span>
            ))}
            <p className="mt-4 px-1 text-[8px] font-semibold tracking-[0.1em] text-sidebar-text uppercase">
              Direct messages
            </p>
            <span className="mt-1 flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-sidebar-text">
              <span className="size-4 rounded-[30%] bg-[#5B8DEF]" /> Amina
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-sidebar-text">
              <span className="size-4 rounded-[30%] bg-[#18A999]" /> Kwame
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col bg-canvas">
            <div className="flex items-center gap-2 border-b border-line bg-paper px-3 py-2.5">
              <span className="grid size-6 place-items-center rounded-lg bg-sage">
                <Hash size={12} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold">general</p>
                <p className="truncate text-[8px] text-muted">Team-wide announcements and the daily pulse.</p>
              </div>
              <span className="ml-auto inline-flex items-center gap-1 rounded-lg border border-mint-deep/25 bg-mint/40 px-2 py-1 text-[8px] font-semibold text-mint-deep">
                <Video size={9} /> Huddle · 3
              </span>
            </div>
            <div className="flex-1 space-y-3 overflow-hidden px-3 py-3">
              {demoMessages.map((message) => (
                <div key={message.name} className="flex gap-2">
                  <Avatar name={message.name} color={message.color} size="xs" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[9px] font-semibold">{message.name}</span>
                      <span className="text-[7px] text-faint">{message.time}</span>
                    </div>
                    <div className="mt-0.5 text-[9px] leading-4 text-ink-soft">
                      <RichText body={message.text} />
                    </div>
                    {message.reactions.length > 0 && (
                      <div className="mt-1 flex gap-1">
                        {message.reactions.map((reaction) => (
                          <span
                            key={reaction}
                            className="rounded-full border border-line bg-paper px-1 py-0.5 text-[7px]"
                          >
                            {reaction}
                          </span>
                        ))}
                      </div>
                    )}
                    {message.thread && (
                      <p className="mt-1 text-[8px] font-semibold text-mint-deep">{message.thread}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mx-3 mb-3 rounded-lg border border-line bg-paper px-2.5 py-2 text-[8px] text-faint">
              Message #general
            </div>
          </div>
        </div>
      </div>

      <div className="animate-pop absolute -right-3 bottom-10 w-[190px] rounded-2xl border border-line bg-paper p-3 shadow-2xl sm:-right-6">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mint/50 px-2 py-0.5 text-[8px] font-semibold text-mint-deep">
            <span className="size-1.5 rounded-full bg-mint-deep" /> Live
          </span>
          <span className="font-mono text-[8px] text-faint">04:12</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {['#D97757', '#5B8DEF', '#18A999', '#B07AA1'].map((color) => (
            <div key={color} className="aspect-video rounded-md" style={{ background: color }} />
          ))}
        </div>
        <div className="mt-2 flex justify-center gap-1.5">
          <span className="size-4 rounded-full bg-sage" />
          <span className="size-4 rounded-full bg-sage" />
          <span className="size-4 rounded-full bg-coral" />
        </div>
      </div>
    </div>
  );
}
