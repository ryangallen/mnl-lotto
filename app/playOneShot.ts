let cachedCtx: AudioContext | null = null;
const cachedBuffers = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();

function getCtx(): AudioContext | null {
  if (cachedCtx) return cachedCtx;
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  cachedCtx = new Ctx();
  return cachedCtx;
}

async function loadBuffer(
  ctx: AudioContext,
  src: string
): Promise<AudioBuffer | null> {
  const cached = cachedBuffers.get(src);
  if (cached) return cached;
  const pending = inflight.get(src);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const res = await fetch(src);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      cachedBuffers.set(src, buffer);
      return buffer;
    } catch {
      return null;
    } finally {
      inflight.delete(src);
    }
  })();
  inflight.set(src, promise);
  return promise;
}

export async function playOneShot(src: string, volume = 1) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }
  const buffer = await loadBuffer(ctx, src);
  if (!buffer) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  source.connect(gain).connect(ctx.destination);
  source.start();
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
}
