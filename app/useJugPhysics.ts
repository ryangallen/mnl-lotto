import { useCallback, useEffect, useRef } from 'react';

import type { Ball } from './types';

const GRAVITY = 380;
const WALL_DAMPING = 0.75;
const FLOOR_DAMPING = 0.6;
const GUST_PROBABILITY_PER_BALL_PER_SECOND = 2.5;
const GUST_STRENGTH_X = 220;
const GUST_STRENGTH_Y = 380;
const GUST_UPWARD_BIAS = 0.5;
const AMBIENT_TURBULENCE = 35;
const MAX_DT = 1 / 30;

type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type Options = {
  balls: Ball[];
  active: boolean;
  gustsEnabled?: boolean;
  width: number;
  height: number;
  ballSize: number;
  padding?: number;
};

type Result = {
  registerBall: (ball: Ball) => (el: HTMLElement | null) => void;
};

export function useJugPhysics({
  balls,
  active,
  gustsEnabled = true,
  width,
  height,
  ballSize,
  padding = 8,
}: Options): Result {
  const bodiesRef = useRef<Map<Ball, Body>>(new Map());
  const elementsRef = useRef<Map<Ball, HTMLElement>>(new Map());
  const refSettersRef = useRef<
    Map<Ball, (el: HTMLElement | null) => void>
  >(new Map());
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const optsRef = useRef({ width, height, ballSize, padding });
  optsRef.current = { width, height, ballSize, padding };
  const gustsEnabledRef = useRef(gustsEnabled);
  gustsEnabledRef.current = gustsEnabled;

  useEffect(() => {
    const bodies = bodiesRef.current;
    const { width: w, height: h, ballSize: bs, padding: p } = optsRef.current;
    const minX = p;
    const maxX = w - p - bs;
    const minY = p;
    const maxY = h - p - bs;

    for (const ball of balls) {
      if (!bodies.has(ball)) {
        bodies.set(ball, {
          x: minX + Math.random() * Math.max(1, maxX - minX),
          y: minY + Math.random() * Math.max(1, (maxY - minY) * 0.4),
          vx: (Math.random() - 0.5) * 200,
          vy: (Math.random() - 0.5) * 200,
        });
      }
    }
    Array.from(bodies.keys()).forEach((key) => {
      if (!balls.includes(key)) {
        bodies.delete(key);
        elementsRef.current.delete(key);
        refSettersRef.current.delete(key);
      }
    });

    elementsRef.current.forEach((el, ball) => {
      const body = bodies.get(ball);
      if (body) {
        el.style.transform = `translate3d(${body.x}px, ${body.y}px, 0)`;
      }
    });
  }, [balls]);

  useEffect(() => {
    if (!active) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
      return;
    }

    const tick = (now: number) => {
      const last = lastTimeRef.current ?? now;
      const dt = Math.min(MAX_DT, (now - last) / 1000);
      lastTimeRef.current = now;

      const { width: w, height: h, ballSize: bs, padding: p } = optsRef.current;
      const minX = p;
      const maxX = w - p - bs;
      const minY = p;
      const maxY = h - p - bs;

      const bodies = bodiesRef.current;
      const elements = elementsRef.current;
      const gustsOn = gustsEnabledRef.current;
      const gustChance = gustsOn ? GUST_PROBABILITY_PER_BALL_PER_SECOND * dt : 0;
      const turbulenceScale = gustsOn ? AMBIENT_TURBULENCE * dt * 60 : 0;
      const horizontalAirDamping = gustsOn ? 1 : 0.985;
      const floorBounceKick = gustsOn ? 30 : 0;
      const floorVerticalDamping = gustsOn ? FLOOR_DAMPING : 0.25;
      const floorHorizontalFriction = gustsOn ? 0.92 : 0.7;
      const restThreshold = gustsOn ? 0 : 18;

      bodies.forEach((body, ball) => {
        body.vy += GRAVITY * dt;

        if (turbulenceScale > 0) {
          body.vx += (Math.random() - 0.5) * 2 * turbulenceScale;
          body.vy += (Math.random() - 0.7) * 2 * turbulenceScale;
        }

        if (gustChance > 0 && Math.random() < gustChance) {
          body.vx += (Math.random() - 0.5) * 2 * GUST_STRENGTH_X;
          body.vy -=
            (GUST_UPWARD_BIAS + Math.random() * (1 - GUST_UPWARD_BIAS)) *
            GUST_STRENGTH_Y;
        }

        body.vx *= horizontalAirDamping;

        body.x += body.vx * dt;
        body.y += body.vy * dt;

        if (body.x < minX) {
          body.x = minX;
          body.vx = Math.abs(body.vx) * WALL_DAMPING;
        } else if (body.x > maxX) {
          body.x = maxX;
          body.vx = -Math.abs(body.vx) * WALL_DAMPING;
        }

        if (body.y < minY) {
          body.y = minY;
          body.vy = Math.abs(body.vy) * WALL_DAMPING;
        } else if (body.y > maxY) {
          body.y = maxY;
          body.vy = -Math.abs(body.vy) * floorVerticalDamping - floorBounceKick;
          body.vx *= floorHorizontalFriction;
        }

        if (!gustsOn) {
          if (Math.abs(body.vx) < restThreshold) body.vx = 0;
          if (
            body.y >= maxY - 0.5 &&
            Math.abs(body.vy) < restThreshold
          ) {
            body.vy = 0;
            body.y = maxY;
          }
        }

        const el = elements.get(ball);
        if (el) {
          el.style.transform = `translate3d(${body.x}px, ${body.y}px, 0)`;
        }
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
    };
  }, [active]);

  const registerBall = useCallback((ball: Ball) => {
    const existing = refSettersRef.current.get(ball);
    if (existing) return existing;
    const setter = (el: HTMLElement | null) => {
      if (el) {
        elementsRef.current.set(ball, el);
        const body = bodiesRef.current.get(ball);
        if (body) {
          el.style.transform = `translate3d(${body.x}px, ${body.y}px, 0)`;
        }
      } else {
        elementsRef.current.delete(ball);
      }
    };
    refSettersRef.current.set(ball, setter);
    return setter;
  }, []);

  return { registerBall };
}
