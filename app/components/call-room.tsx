import {
  Copy,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Video as VideoIcon,
  VideoOff,
  X,
} from 'lucide-react';
import { useRealtime } from '../lib/realtime-client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  getIceServersFn,
  heartbeatCallFn,
  leaveCallFn,
  pollCallSignalsFn,
  sendCallSignalFn,
} from '../lib/calls';
import { CALL_LIMIT_MINUTES, callTimeLeft, callTimeLeftMs } from '../lib/format';
import type { CallView, UserSummary } from '../lib/types';
import { Avatar } from './avatar';
import { cn } from '../utils/cn';

type Peer = {
  pc: RTCPeerConnection;
  pending: RTCIceCandidateInit[];
  createdAt: number;
};

const TURN_URL = import.meta.env.VITE_TURN_URL as string | undefined;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME as string | undefined;
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

/** Used only if the server cannot be asked: public STUN plus a build-time TURN relay, if configured. */
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
  ...(TURN_URL
    ? [{ urls: TURN_URL, username: TURN_USERNAME, credential: TURN_CREDENTIAL }]
    : []),
];
/** Do not hold the call back longer than this waiting for TURN credentials. */
const ICE_WAIT_MS = 6000;

export function CallRoom({
  workspaceSlug,
  call,
  me,
  channelName,
  onLeave,
}: {
  workspaceSlug: string;
  call: CallView;
  me: UserSummary;
  channelName: string;
  onLeave: () => void;
}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [iceServers, setIceServers] = useState<RTCIceServer[] | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>(FALLBACK_ICE_SERVERS);
  const localVideo = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, Peer>>(new Map());
  const mutedRef = useRef(false);
  const cameraRef = useRef(true);
  const sharingRef = useRef(false);
  const signalQueue = useRef<Promise<void>>(Promise.resolve());
  const pollSignals = useRef<() => void>(() => undefined);
  const leftRef = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch {
        try {
          const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (cancelled) {
            audio.getTracks().forEach((track) => track.stop());
            return;
          }
          localStreamRef.current = audio;
          setLocalStream(audio);
          setCameraOn(false);
          cameraRef.current = false;
          setMediaError('Camera unavailable. You joined with audio only.');
        } catch {
          if (cancelled) return;
          setMediaError('Microphone and camera are blocked. Check browser permissions.');
          void leave();
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenRef.current?.getTracks().forEach((track) => track.stop());
      for (const peer of peersRef.current.values()) peer.pc.close();
      peersRef.current.clear();
      if (!leftRef.current) {
        // React may clean up and re-run an effect in development. Give the remount a moment first.
        leaveTimer.current = setTimeout(() => {
          if (!leftRef.current) void leaveCallFn({ data: { callId: call.id } }).catch(() => undefined);
        }, 600);
      }
    };
  }, [call.id]);

  useEffect(() => {
    if (localVideo.current && localStream) {
      localVideo.current.srcObject = localStream;
      void localVideo.current.play().catch(() => undefined);
    }
  }, [localStream]);

  // TURN credentials come from the server (short-lived when Cloudflare TURN is configured). Peer
  // connections wait for these as well as for the local media stream.
  useEffect(() => {
    let active = true;
    const settle = (servers: RTCIceServer[]) => {
      if (!active || iceServersRef.current !== FALLBACK_ICE_SERVERS) return;
      iceServersRef.current = servers;
      setIceServers(servers);
    };
    const giveUp = setTimeout(() => settle(FALLBACK_ICE_SERVERS), ICE_WAIT_MS);
    void getIceServersFn()
      .then((result) => settle(result.iceServers))
      .catch(() => settle(FALLBACK_ICE_SERVERS));
    return () => {
      active = false;
      clearTimeout(giveUp);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeLeftMs = callTimeLeftMs(call.startedAt, now);
  const lastMinute = timeLeftMs <= 60_000;
  const timeUp = timeLeftMs === 0;
  useEffect(() => {
    if (lastMinute && !timeUp) toast('One minute left in this huddle.');
  }, [lastMinute]);
  useEffect(() => {
    if (!timeUp || leftRef.current) return;
    toast(`Huddles last up to ${CALL_LIMIT_MINUTES} minutes. Start a new one to keep talking.`);
    void leave();
  }, [timeUp]);

  useEffect(() => {
    if (!localStream) return;
    const send = () => {
      void heartbeatCallFn({
        data: {
          callId: call.id,
          muted: mutedRef.current,
          cameraOn: cameraRef.current,
          sharing: sharingRef.current,
        },
      }).catch(() => undefined);
    };
    send();
    // Keeps this person in the call (the server drops anyone silent for 2 minutes). Mute, camera and
    // screen changes are sent at once by the effect below, and pushed to the others.
    const timer = setInterval(send, 20_000);
    return () => clearInterval(timer);
  }, [call.id, localStream]);

  useEffect(() => {
    if (!localStream) return;
    void heartbeatCallFn({ data: { callId: call.id, muted, cameraOn, sharing } }).catch(() => undefined);
  }, [call.id, localStream, muted, cameraOn, sharing]);

  useEffect(() => {
    if (!localStream || !iceServers) return;
    const poll = () => {
      signalQueue.current = signalQueue.current
        .then(async () => {
          const signals = await pollCallSignalsFn({ data: { callId: call.id } });
          for (const signal of signals) {
            await handleSignal(signal.fromUserId, signal.kind, signal.payload);
          }
        })
        .catch(() => undefined);
    };
    pollSignals.current = poll;
    poll();
    return () => {
      pollSignals.current = () => undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id, me.id, localStream, iceServers]);

  // Offers, answers and ICE candidates are pushed: fetch them the moment the socket says so.
  useRealtime(workspaceSlug, (event) => {
    if (event.t === 'sync' || (event.t === 'signal' && event.call === call.id)) pollSignals.current();
  });

  useEffect(() => {
    if (!localStream || !iceServers) return;
    const others = call.participants.filter((participant) => participant.userId !== me.id);
    for (const participant of others) {
      if (!peersRef.current.has(participant.userId)) {
        void createPeer(participant.userId, me.id < participant.userId);
      }
    }
    for (const userId of [...peersRef.current.keys()]) {
      if (!others.some((participant) => participant.userId === userId)) closePeer(userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.participants, me.id, localStream, iceServers]);

  useEffect(() => {
    if (!localStream || !iceServers) return;
    const timer = setInterval(() => {
      const others = call.participants.filter((participant) => participant.userId !== me.id);
      for (const participant of others) {
        const peer = peersRef.current.get(participant.userId);
        if (!peer) {
          void createPeer(participant.userId, me.id < participant.userId);
          continue;
        }
        if (peer.pc.connectionState !== 'connected' && Date.now() - peer.createdAt > 4000) {
          closePeer(participant.userId);
          void createPeer(participant.userId, me.id < participant.userId);
        }
      }
    }, 1500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.participants, me.id, localStream, iceServers]);

  function closePeer(userId: string) {
    const peer = peersRef.current.get(userId);
    if (!peer) return;
    peer.pc.close();
    peersRef.current.delete(userId);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
  }

  async function createPeer(userId: string, initiator: boolean) {
    if (peersRef.current.has(userId)) return peersRef.current.get(userId)!;
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const peer: Peer = { pc, pending: [], createdAt: Date.now() };
    peersRef.current.set(userId, peer);

    const stream = localStreamRef.current;
    if (stream) {
      const video = sharingRef.current
        ? screenRef.current?.getVideoTracks()[0] ?? stream.getVideoTracks()[0]
        : stream.getVideoTracks()[0];
      if (video) pc.addTrack(video, stream);
      for (const audio of stream.getAudioTracks()) pc.addTrack(audio, stream);
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void sendCallSignalFn({
        data: {
          callId: call.id,
          toUserId: userId,
          kind: 'ice',
          payload: event.candidate.toJSON(),
        },
      }).catch(() => undefined);
    };

    pc.ontrack = (event) => {
      const [remote] = event.streams;
      if (!remote) return;
      setRemoteStreams((current) => ({ ...current, [userId]: remote }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        closePeer(userId);
      }
    };

    if (initiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendCallSignalFn({
          data: {
            callId: call.id,
            toUserId: userId,
            kind: 'offer',
            payload: { type: 'offer', sdp: offer.sdp },
          },
        });
      } catch {
        closePeer(userId);
      }
    }
    return peer;
  }

  async function handleSignal(
    fromUserId: string,
    kind: 'offer' | 'answer' | 'ice',
    payload: unknown,
  ) {
    if (fromUserId === me.id) return;
    let peer = peersRef.current.get(fromUserId);
    if (!peer) peer = await createPeer(fromUserId, false);
    const pc = peer.pc;
    try {
      if (kind === 'offer') {
        const sdp = (payload as { sdp?: string }).sdp;
        if (!sdp || pc.signalingState !== 'stable') return;
        await pc.setRemoteDescription({ type: 'offer', sdp });
        await flushIce(peer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendCallSignalFn({
          data: {
            callId: call.id,
            toUserId: fromUserId,
            kind: 'answer',
            payload: { type: 'answer', sdp: answer.sdp },
          },
        });
      } else if (kind === 'answer') {
        const sdp = (payload as { sdp?: string }).sdp;
        if (!sdp || pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription({ type: 'answer', sdp });
        await flushIce(peer);
      } else {
        const candidate = payload as RTCIceCandidateInit;
        if (pc.remoteDescription) await pc.addIceCandidate(candidate);
        else peer.pending.push(candidate);
      }
    } catch {
      // A late or duplicate candidate is harmless.
    }
  }

  async function flushIce(peer: Peer) {
    const pending = peer.pending.splice(0);
    for (const candidate of pending) {
      await peer.pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
  }

  function toggleCamera() {
    const next = !cameraOn;
    setCameraOn(next);
    cameraRef.current = next;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
  }

  async function toggleShare() {
    if (sharingRef.current) {
      await stopShare();
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenRef.current = display;
      const track = display.getVideoTracks()[0];
      for (const peer of peersRef.current.values()) {
        const sender = peer.pc.getSenders().find((item) => item.track?.kind === 'video');
        if (sender) await sender.replaceTrack(track);
      }
      track.onended = () => void stopShare();
      setSharing(true);
      sharingRef.current = true;
    } catch {
      toast.error('Screen share was cancelled.');
    }
  }

  async function stopShare() {
    screenRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    for (const peer of peersRef.current.values()) {
      const sender = peer.pc.getSenders().find((item) => item.track?.kind === 'video');
      if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
    }
    setSharing(false);
    sharingRef.current = false;
  }

  async function leave() {
    leftRef.current = true;
    await stopShare();
    try {
      await leaveCallFn({ data: { callId: call.id } });
    } catch {
      // The local room closes even if the server call already ended.
    }
    onLeave();
  }

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href);
    toast.success('Channel link copied.');
  }

  const tiles = call.participants.filter((participant) => participant.userId !== me.id);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0d1110] text-white">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
            <span className="size-1.5 animate-pulse rounded-full bg-[#7BE0B8]" />
            Huddle live
          </span>
          <div>
            <h2 className="text-sm font-semibold">#{channelName}</h2>
            <p className="font-mono text-[11px] text-white/45">
              <span className={lastMinute ? 'text-[#FFB4A2]' : undefined}>{callTimeLeft(call.startedAt, now)} left</span> · {call.participants.length} in the room
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={copyLink}
            className="grid size-9 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Copy channel link"
          >
            <Copy size={17} />
          </button>
          <button
            type="button"
            onClick={() => void leave()}
            className="grid size-9 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Leave call"
            title="Leave call"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {mediaError && (
          <div className="mx-auto mb-4 max-w-xl rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            {mediaError}
          </div>
        )}
        <div
          className={cn(
            'mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2',
            tiles.length > 2 && 'xl:grid-cols-3',
          )}
        >
          <VideoTile
            label={`${me.name} (you)`}
            color={me.avatarColor}
            avatarUrl={me.avatarUrl}
            stream={localStream}
            muted
            cameraOn={cameraOn}
            sharing={sharing}
            isLocal
          />
          {tiles.map((participant) => (
            <VideoTile
              key={participant.userId}
              label={participant.name}
              color={participant.avatarColor}
              avatarUrl={participant.avatarUrl}
              stream={remoteStreams[participant.userId] ?? null}
              muted={participant.muted}
              cameraOn={participant.cameraOn}
              sharing={participant.sharing}
            />
          ))}
        </div>

        {tiles.length === 0 && (
          <p className="mt-6 text-center text-sm text-white/45">
            You are the first one here. Send the channel a message and people can join with one
            click.
          </p>
        )}
      </div>

      <footer className="flex items-center justify-center gap-2.5 border-t border-white/10 px-5 py-5">
        <ControlButton
          active={!muted}
          label={muted ? 'Unmute' : 'Mute'}
          onClick={toggleMute}
        >
          {muted ? <MicOff size={19} /> : <Mic size={19} />}
        </ControlButton>
        <ControlButton
          active={cameraOn}
          label={cameraOn ? 'Camera off' : 'Camera on'}
          onClick={toggleCamera}
        >
          {cameraOn ? <VideoIcon size={19} /> : <VideoOff size={19} />}
        </ControlButton>
        <ControlButton active={sharing} label="Share screen" onClick={() => void toggleShare()}>
          <MonitorUp size={19} />
        </ControlButton>
        <button
          type="button"
          onClick={() => void leave()}
          className="ml-2 inline-flex h-12 items-center gap-2 rounded-2xl bg-[#E5483B] px-5 text-sm font-semibold text-white transition hover:bg-[#c9382d]"
        >
          <PhoneOff size={18} /> Leave
        </button>
      </footer>
    </div>
  );
}

function ControlButton({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'grid size-12 place-items-center rounded-2xl border transition',
        active
          ? 'border-white/15 bg-white/10 text-white hover:bg-white/15'
          : 'border-transparent bg-white/5 text-white/50 hover:bg-white/10 hover:text-white',
      )}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

function VideoTile({
  label,
  color,
  avatarUrl,
  stream,
  muted,
  cameraOn,
  sharing,
  isLocal,
}: {
  label: string;
  color: string;
  avatarUrl?: string | null;
  stream: MediaStream | null;
  muted?: boolean;
  cameraOn: boolean;
  sharing: boolean;
  isLocal?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!ref.current || !stream) return;
    ref.current.srcObject = stream;
    void ref.current.play().catch(() => undefined);
  }, [stream]);

  const hasVideo = Boolean(
    stream && stream.getVideoTracks().length > 0 && (cameraOn || sharing),
  );

  return (
    <div
      className={cn(
        'relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-[#161c1a]',
        sharing && 'sm:col-span-2',
      )}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={cn('size-full object-cover', !hasVideo && 'opacity-0')}
      />
      {!hasVideo && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <Avatar name={label} color={color} src={avatarUrl} size="2xl" />
            <span className="text-xs text-white/45">Camera off</span>
          </div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-2.5">
        <span className="truncate text-xs font-medium">{label}</span>
        <div className="flex items-center gap-1.5">
          {sharing && (
            <span className="rounded bg-[#7BE0B8] px-1.5 py-0.5 text-[10px] font-semibold text-[#0d1110]">
              sharing
            </span>
          )}
          {!isLocal && muted && <MicOff size={13} className="text-white/60" />}
        </div>
      </div>
    </div>
  );
}


