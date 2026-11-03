import type { ReactNode } from 'react';
import { Hash, Phone, Sparkles } from 'lucide-react';
import { Avatar } from './avatar';
import { Wordmark } from './logo';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[46%_54%]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-bright lg:flex">
        <div className="pointer-events-none absolute -top-48 -left-24 size-[560px] rounded-full bg-[#27342f] blur-3xl" />
        <div className="relative">
          <Wordmark className="text-sidebar-bright" />
        </div>
        <div className="relative">
          <div className="mb-8 flex items-center gap-2 text-[11px] tracking-[0.12em] text-sidebar-text uppercase">
            <Sparkles size={13} /> Built for teams that ship
          </div>
          <h2 className="max-w-md font-display text-[54px] leading-[0.98] tracking-[-0.02em]">
            Less noise.
            <br />
            More <span className="text-coral">decisions.</span>
          </h2>
          <p className="mt-5 max-w-sm text-sm leading-6 text-sidebar-text">
            Channels for the work, threads for the details, huddles when typing stops being enough.
          </p>
          <div className="mt-10 max-w-sm rounded-2xl border border-sidebar-line bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 border-b border-sidebar-line pb-3">
              <span className="grid size-7 place-items-center rounded-lg bg-white/10">
                <Hash size={13} />
              </span>
              <span className="text-sm font-semibold">product</span>
              <span className="ml-auto flex items-center gap-1 rounded-full bg-[#234d3f] px-2 py-0.5 text-[10px] text-[#9fe4c8]">
                <span className="size-1.5 rounded-full bg-[#7be0b8]" /> 3 in a huddle
              </span>
            </div>
            <div className="mt-3 space-y-3">
              <PreviewMessage
                name="Amina Diallo"
                color="#5B8DEF"
                text="Call overlay is in. Camera, screen share, the whole thing."
                time="09:41"
              />
              <PreviewMessage
                name="Kwame Mensah"
                color="#18A999"
                text="Joining. Give me two seconds."
                time="09:42"
                reaction="👍 2"
              />
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-sidebar-line bg-sidebar/60 px-3 py-2 text-xs text-sidebar-text">
              <Phone size={13} className="text-[#7be0b8]" />
              Huddle live · 04:12
            </div>
          </div>
        </div>
        <p className="relative text-[11px] text-sidebar-text/70">
          Kora runs on Cloudflare Workers, D1, and R2.
        </p>
      </aside>

      <main className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between px-5 py-5 sm:px-10">
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Avatar name="Kora team" color="#EF5F3E" size="sm" />
            <span className="hidden text-xs text-muted sm:block">Kora Studio</span>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pb-16 sm:px-8">
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-6 text-sm text-muted">{footer}</div>
        </div>
      </main>
    </div>
  );
}

function PreviewMessage({
  name,
  color,
  text,
  time,
  reaction,
}: {
  name: string;
  color: string;
  text: string;
  time: string;
  reaction?: string;
}) {
  return (
    <div className="flex gap-2.5">
      <Avatar name={name} color={color} size="sm" />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] font-semibold">{name}</span>
          <span className="font-mono text-[9px] text-sidebar-text">{time}</span>
        </div>
        <p className="mt-0.5 text-[12px] leading-5 text-sidebar-text">{text}</p>
        {reaction && (
          <span className="mt-1 inline-flex rounded-full border border-sidebar-line px-1.5 py-0.5 text-[10px] text-sidebar-text">
            {reaction}
          </span>
        )}
      </div>
    </div>
  );
}
