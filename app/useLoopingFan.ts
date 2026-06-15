import { useEffect, useRef } from 'react';

const FADE_SECONDS = 0.4;
const SILENCE_THRESHOLD = 0.005;
const PER_LAYER_GAIN = 0.7;

type Options = {
  src: string;
  active: boolean;
};

function findLoopBounds(buffer: AudioBuffer): {
  loopStart: number;
  loopEnd: number;
} {
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channelData.push(buffer.getChannelData(c));
  }

  const isSilent = (i: number) => {
    for (const data of channelData) {
      if (Math.abs(data[i]) > SILENCE_THRESHOLD) return false;
    }
    return true;
  };

  let firstSound = 0;
  while (firstSound < length && isSilent(firstSound)) firstSound++;

  let lastSound = length - 1;
  while (lastSound > firstSound && isSilent(lastSound)) lastSound--;

  if (firstSound >= lastSound) {
    return { loopStart: 0, loopEnd: buffer.duration };
  }

  return {
    loopStart: firstSound / sampleRate,
    loopEnd: (lastSound + 1) / sampleRate,
  };
}

type ActiveLayer = {
  source: AudioBufferSourceNode;
};

export function useLoopingFan({ src, active }: Options) {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const loopBoundsRef = useRef<{ loopStart: number; loopEnd: number } | null>(
    null
  );
  const layersRef = useRef<ActiveLayer[]>([]);
  const masterGainRef = useRef<GainNode | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      const ctx = ctxRef.current;
      const layers = layersRef.current;
      const master = masterGainRef.current;
      if (!ctx || layers.length === 0 || !master) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
      const layersToStop = layers;
      layersRef.current = [];
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = setTimeout(() => {
        for (const layer of layersToStop) {
          try {
            layer.source.stop();
          } catch {}
          layer.source.disconnect();
        }
      }, FADE_SECONDS * 1000 + 50);
    };

    const start = async () => {
      if (!ctxRef.current) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctx) return;
        ctxRef.current = new Ctx();
      }
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (cancelled) return;

      if (!bufferRef.current) {
        try {
          const res = await fetch(src);
          const arrayBuffer = await res.arrayBuffer();
          const buffer = await ctx.decodeAudioData(arrayBuffer);
          bufferRef.current = buffer;
          loopBoundsRef.current = findLoopBounds(buffer);
        } catch {
          return;
        }
      }
      if (cancelled || !bufferRef.current || !loopBoundsRef.current) return;

      for (const layer of layersRef.current) {
        try {
          layer.source.stop();
        } catch {}
        layer.source.disconnect();
      }
      layersRef.current = [];
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
        stopTimeoutRef.current = null;
      }

      const { loopStart, loopEnd } = loopBoundsRef.current;
      const loopDuration = loopEnd - loopStart;

      const master = ctx.createGain();
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.connect(ctx.destination);
      master.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_SECONDS);
      masterGainRef.current = master;

      const offsets = [loopStart, loopStart + loopDuration / 2];
      for (const offset of offsets) {
        const source = ctx.createBufferSource();
        source.buffer = bufferRef.current;
        source.loop = true;
        source.loopStart = loopStart;
        source.loopEnd = loopEnd;
        const layerGain = ctx.createGain();
        layerGain.gain.setValueAtTime(PER_LAYER_GAIN, ctx.currentTime);
        source.connect(layerGain).connect(master);
        source.start(0, offset);
        layersRef.current.push({ source });
      }
    };

    if (active) {
      start();
    } else {
      stop();
    }

    return () => {
      cancelled = true;
    };
  }, [active, src]);

  useEffect(
    () => () => {
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
      for (const layer of layersRef.current) {
        try {
          layer.source.stop();
        } catch {}
        layer.source.disconnect();
      }
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
      }
    },
    []
  );
}
