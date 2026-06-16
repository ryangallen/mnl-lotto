'use client';

import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  TextField,
  Typography,
} from '@mui/material';
import { keyframes } from '@mui/material/styles';

import find from 'lodash/find';
import get from 'lodash/get';

import { useLoopingFan } from './useLoopingFan';
import { playOneShot } from './playOneShot';
import { useJugPhysics } from './useJugPhysics';
import type { Ball, Team } from './types';

type MachineState = 'idle' | 'running' | 'paused' | 'finished';

const stringToColor = (str: string) => {
  let hash = 0;
  str.split('').forEach((char) => {
    hash = char.charCodeAt(0) + ((hash << 5) - hash);
  });
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += value.toString(16).padStart(2, '0');
  }
  return color;
};

let ballIdCounter = 0;
const nextBallId = () => `b${++ballIdCounter}`;

const createNBalls = (n: number, color: string) =>
  [...Array(n)].map(() => ({ id: nextBallId(), color }));

const DEFAULT_BALL_COUNT = 3;
const PULL_DISPLAY_MS = 1500;
const PULL_FADE_MS = 600;

const fadeInBall = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const DEFAULT_TEAMS = [
  { name: 'Golden Seals', color: '#FFE680' },
  { name: 'Nordiques', color: '#5BA8FF' },
  { name: 'North Stars', color: '#3FE6A0' },
  { name: 'Whalers', color: '#7D8385' },
  { name: 'Americans', color: '#FFF' },
  { name: 'Tigers', color: '#B84CFF' },
  { name: 'Scouts', color: '#FF5B6E' },
].map((team) => ({
  ...team,
  balls: createNBalls(DEFAULT_BALL_COUNT, team.color),
}));

const teamsFromString = (str: string, ballCount: number) =>
  str
    .replace(/[^\w\s,]/gi, '')
    .split(',')
    .filter(Boolean)
    .map((token) => {
      const name = token.trim();

      const predefinedTeam = find(
        DEFAULT_TEAMS,
        (team: Team) => team.name === name,
      );
      const color = predefinedTeam?.color || stringToColor(name);

      return {
        name,
        color,
        balls: createNBalls(ballCount, color),
      };
    });

export default function Home() {
  const [ballCount, setBallCount] = useState<number>(DEFAULT_BALL_COUNT);
  const [teams, setTeams] = useState<Team[]>(DEFAULT_TEAMS);
  const [draftTitle, setDraftTitle] = useState<string>('Main Draft');

  const [machineState, setMachineState] = useState<MachineState>('idle');
  const [loaded, setLoaded] = useState<boolean>(false);
  const [lottoId, setLottoId] = useState<string | null>(null);
  const [jugBalls, setJugBalls] = useState<Ball[]>([]);
  const [pulledBalls, setPulledBalls] = useState<Ball[]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [displayedBall, setDisplayedBall] = useState<Ball | null>(null);
  const [displayedBallVisible, setDisplayedBallVisible] = useState(false);
  const [pullLocked, setPullLocked] = useState(false);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadTimeoutsRef = useRef<number[]>([]);

  useLoopingFan({
    src: '/static/fan-running.mp3',
    active: machineState === 'running',
  });

  const clearDisplayedBall = useCallback(() => {
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }
    if (lockTimeoutRef.current) {
      clearTimeout(lockTimeoutRef.current);
      lockTimeoutRef.current = null;
    }
    if (loadTimeoutsRef.current.length) {
      loadTimeoutsRef.current.forEach((id) => clearTimeout(id));
      loadTimeoutsRef.current = [];
    }
    setDisplayedBallVisible(false);
    setDisplayedBall(null);
    setPullLocked(false);
  }, []);

  useEffect(
    () => () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
      if (loadTimeoutsRef.current.length) {
        loadTimeoutsRef.current.forEach((id) => clearTimeout(id));
        loadTimeoutsRef.current = [];
      }
    },
    [],
  );

  const totalBalls = useMemo(
    () => teams.reduce((sum, t) => sum + t.balls.length, 0),
    [teams],
  );

  const formatTimestamp = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate(),
    )}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  };

  const makeLottoId = (title: string) => {
    const clean = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
    return `${clean || 'draft'}-${formatTimestamp()}`;
  };

  // load lottery from URL/localStorage on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('lotto');
      if (!id) return;
      const key = `mnl-lotto:${id}`;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed) return;
      // restore state
      setDraftTitle(parsed.draftTitle ?? 'Main Draft');
      setBallCount(parsed.ballCount ?? DEFAULT_BALL_COUNT);
      if (parsed.teams) setTeams(parsed.teams);
      if (parsed.jugBalls) setJugBalls(parsed.jugBalls);
      if (parsed.pulledBalls) setPulledBalls(parsed.pulledBalls);
      // always load with the machine paused/off so user must turn it on
      setMachineState('paused');
      setLoaded(parsed.loaded ?? true);
      setLottoId(id);
    } catch {
      // ignore
    }
  }, []);

  const draftOrder = useMemo<(Team | null)[]>(() => {
    const slots: (Team | null)[] = teams.map(() => null);
    if (teams.length === 0) return slots;

    const pulledByColor = new Map<string, number>();
    const eliminationOrder: Team[] = [];

    for (const ball of pulledBalls) {
      const next = (pulledByColor.get(ball.color) ?? 0) + 1;
      pulledByColor.set(ball.color, next);
      const team = find(teams, (t: Team) => t.color === ball.color);
      if (
        team &&
        next === team.balls.length &&
        !find(eliminationOrder, (t) => t.color === team.color)
      ) {
        eliminationOrder.push(team);
      }
    }

    eliminationOrder.forEach((team, i) => {
      const slotIdx = teams.length - 1 - i;
      if (slotIdx >= 0) slots[slotIdx] = team;
    });

    const unassigned = teams.filter(
      (t) => !find(eliminationOrder, (e) => e.color === t.color),
    );
    if (unassigned.length === 1) {
      const firstEmpty = slots.findIndex((s) => s === null);
      if (firstEmpty !== -1) slots[firstEmpty] = unassigned[0];
    }

    return slots;
  }, [teams, pulledBalls]);

  const handleBallCountChange = useCallback(
    (value: number) => {
      setBallCount(value);
      setTeams((prev) =>
        prev.map((team) => ({
          ...team,
          balls: createNBalls(value, team.color),
        })),
      );
      if (machineState !== 'idle') {
        setMachineState('idle');
        setJugBalls([]);
        setPulledBalls([]);
        setLoaded(false);
        clearDisplayedBall();
      }
    },
    [machineState, clearDisplayedBall],
  );

  const handleTeamsChange = useCallback(
    (str: string) => {
      setTeams(teamsFromString(str, ballCount));
      if (machineState !== 'idle') {
        setMachineState('idle');
        setJugBalls([]);
        setPulledBalls([]);
        setLoaded(false);
        clearDisplayedBall();
      }
    },
    [machineState, ballCount, clearDisplayedBall],
  );

  const handleStart = useCallback(() => {
    playOneShot('/static/button-press.mp3');
    const allBalls = teams.flatMap((t) => t.balls);
    const shuffled = [...allBalls].sort(() => Math.random() - 0.5);
    setJugBalls(shuffled);
    setPulledBalls([]);
    setMachineState('running');
    clearDisplayedBall();
  }, [teams, clearDisplayedBall]);

  const handleLoad = useCallback(() => {
    // Play a start sound then stagger many load-ball sounds to simulate balls loading
    playOneShot('/static/start.mp3');

    const allBalls = teams.flatMap((t) => t.balls);
    const shuffled = [...allBalls].sort(() => Math.random() - 0.5);
    setJugBalls(shuffled);
    setPulledBalls([]);
    setMachineState('paused');
    setLoaded(true);
    // create a lotto id and set it in URL/localStorage
    const id = makeLottoId(draftTitle);
    setLottoId(id);
    clearDisplayedBall();

    // staggered load-ball sounds: at most max(num teams, balls per team)
    const maxHits = Math.max(1, Math.max(teams.length, ballCount));
    for (let i = 0; i < maxHits; i++) {
      const delay = i * 120 + Math.floor(Math.random() * 80); // 120ms step with jitter
      const id = window.setTimeout(() => {
        // slightly reduce volume for repeated hits
        playOneShot('/static/load-ball.mp3', 0.75);
      }, delay);
      loadTimeoutsRef.current.push(id);
    }
  }, [teams, clearDisplayedBall, totalBalls, draftTitle, ballCount]);

  // auto-save lottery state when lottoId exists and relevant state changes
  useEffect(() => {
    if (!lottoId) return;
    try {
      const key = `mnl-lotto:${lottoId}`;
      const payload = {
        id: lottoId,
        draftTitle,
        ballCount,
        teams,
        machineState,
        jugBalls,
        pulledBalls,
        loaded,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(key, JSON.stringify(payload));
      const url = new URL(window.location.href);
      url.searchParams.set('lotto', lottoId);
      // push a new history entry so URL updates are navigable
      window.history.pushState({}, '', url.toString());
    } catch {
      // ignore
    }
  }, [
    lottoId,
    draftTitle,
    ballCount,
    teams,
    machineState,
    jugBalls,
    pulledBalls,
    loaded,
  ]);

  const receiptDownloadedRef = useRef(false);

  // when the lottery completes, automatically download a JSON receipt
  useEffect(() => {
    if (machineState !== 'finished') return;
    if (receiptDownloadedRef.current) return;
    try {
      const payload = {
        id: lottoId ?? makeLottoId(draftTitle),
        draftTitle,
        ballCount,
        teams,
        jugBalls,
        pulledBalls,
        machineState,
        loaded,
        draftOrder: draftOrder.map((t) => (t ? t.name : null)),
        savedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = `${payload.id || 'lottery'}-receipt.json`;
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      receiptDownloadedRef.current = true;
    } catch {
      // ignore download errors
    }
  }, [
    machineState,
    lottoId,
    draftTitle,
    ballCount,
    teams,
    jugBalls,
    pulledBalls,
    loaded,
    draftOrder,
  ]);

  const handlePullBall = useCallback(() => {
    if (jugBalls.length === 0 || pullLocked) return;
    playOneShot('/static/pop.mp3');
    const idx = Math.floor(Math.random() * jugBalls.length);
    const pulled = jugBalls[idx];
    const remaining = [...jugBalls.slice(0, idx), ...jugBalls.slice(idx + 1)];
    setJugBalls(remaining);
    setPulledBalls((prev) => [...prev, pulled]);
    if (remaining.length === 0) {
      setMachineState('finished');
    }

    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    setDisplayedBall(pulled);
    setDisplayedBallVisible(true);
    setPullLocked(true);
    fadeTimeoutRef.current = setTimeout(() => {
      setDisplayedBallVisible(false);
      clearTimeoutRef.current = setTimeout(() => {
        setDisplayedBall(null);
      }, PULL_FADE_MS);
    }, PULL_DISPLAY_MS);
    lockTimeoutRef.current = setTimeout(() => {
      setPullLocked(false);
    }, PULL_DISPLAY_MS);
  }, [jugBalls, pullLocked]);

  const handleResetRequest = useCallback(() => {
    setResetDialogOpen(true);
  }, []);

  const handleResetCancel = useCallback(() => {
    setResetDialogOpen(false);
  }, []);

  const handleResetConfirm = useCallback(() => {
    setResetDialogOpen(false);
    setMachineState('idle');
    setJugBalls([]);
    setPulledBalls([]);
    setLoaded(false);
    clearDisplayedBall();
  }, [clearDisplayedBall]);

  const canPull =
    machineState === 'running' && jugBalls.length > 0 && !pullLocked;
  const canReset = machineState !== 'idle' || pulledBalls.length > 0;
  const canTogglePower =
    loaded &&
    ((machineState === 'idle' && totalBalls > 0) ||
      machineState === 'running' ||
      machineState === 'paused');

  const handleTogglePower = useCallback(() => {
    if (machineState === 'idle') {
      handleStart();
    } else if (machineState === 'running') {
      playOneShot('/static/button-press.mp3');
      setMachineState('paused');
    } else if (machineState === 'paused') {
      playOneShot('/static/button-press.mp3');
      setMachineState('running');
    }
  }, [machineState, handleStart]);

  const BALL_SIZE = 30;
  const JUG_WIDTH = 300;
  const JUG_HEIGHT = 500;

  const { registerBall } = useJugPhysics({
    balls: jugBalls,
    active: machineState !== 'idle',
    gustsEnabled: machineState === 'running',
    width: JUG_WIDTH,
    height: JUG_HEIGHT,
    ballSize: BALL_SIZE,
  });

  return (
    <Box
      maxWidth={1280}
      margin='0 auto'
      padding={2}
      display='flex'
      flexDirection='column'
      gap={2}
    >
      <Typography
        variant='h1'
        fontSize='2em'
        fontWeight='bold'
        fontStyle='italic'
        textAlign='center'
        marginBottom={2}
      >
        MNL Draft Lottery
      </Typography>

      <Box
        display='flex'
        flexDirection='row'
        gap={2}
        alignItems='center'
        flexWrap='wrap'
      >
        <TextField
          size='small'
          label='Draft Title'
          variant='outlined'
          defaultValue={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          sx={{ flex: '1 1 200px' }}
        />

        <TextField
          type='number'
          size='small'
          label='Balls per team'
          variant='outlined'
          defaultValue={ballCount}
          onChange={(event) =>
            handleBallCountChange(Number(event.target.value))
          }
          sx={{ width: 120 }}
        />

        <TextField
          size='small'
          label='Teams'
          variant='outlined'
          defaultValue={teams.map(({ name }) => name).join(', ')}
          onChange={(event) => handleTeamsChange(event.target.value)}
          sx={{ flex: '2 1 420px' }}
        />
      </Box>

      <Divider />

      <Box
        display='flex'
        flexDirection='row'
        alignItems='flex-start'
        justifyContent='center'
        gap={6}
        flexWrap='wrap'
      >
        <Box width={200} flexShrink={0} paddingTop={1}>
          <Typography variant='h6' fontWeight='bold' marginBottom={1}>
            Teams
          </Typography>
          <Box
            component='ul'
            display='flex'
            flexDirection='column'
            gap={1}
            margin={0}
            padding={0}
            sx={{ listStyle: 'none' }}
          >
            {teams.map(({ name, color, balls }) => (
              <Box
                component='li'
                key={name}
                display='flex'
                alignItems='center'
                gap={1}
              >
                {machineState === 'idle' ? (
                  <Box display='flex' alignItems='center' gap={0.5}>
                    {balls.map(({ color }, i) => (
                      <Box
                        key={`${color}-${i}`}
                        borderRadius='100%'
                        bgcolor={color}
                        width={BALL_SIZE}
                        height={BALL_SIZE}
                        border='1px solid rgba(0, 0, 0, .2)'
                        boxShadow='0 0 2px rgba(0, 0, 0, .4)'
                      />
                    ))}
                  </Box>
                ) : (
                  <Box
                    bgcolor={color}
                    width={BALL_SIZE}
                    height={BALL_SIZE}
                    borderRadius={0.5}
                    border='1px solid rgba(0, 0, 0, .25)'
                  />
                )}
                <Typography>{name}</Typography>
              </Box>
            ))}
          </Box>
          {machineState === 'idle' && !loaded && (
            <Button
              variant='contained'
              size='large'
              onClick={handleLoad}
              title='Load The Balls! This will load balls and set the machine to paused. The ON/OFF button is disabled until loaded.'
              sx={{
                mt: 3,
                mx: 'auto',
                textTransform: 'uppercase',
                backgroundColor: '#ff8a00',
                fontWeight: 700,
                borderRadius: 2,
                px: 2.5,
                py: 1,
                boxShadow: '0 8px 20px rgba(255,90,0,0.18)',
                '&:hover': {
                  backgroundColor: '#f5880c',
                  boxShadow: '0 10px 24px rgba(255,90,0,0.18)',
                },
              }}
            >
              LOAD THE BALLS!
            </Button>
          )}
        </Box>

        <Box
          display='flex'
          flexDirection='column'
          alignItems='center'
          gap={2}
          marginRight={24}
          marginTop={5}
        >
          <Box display='flex' flexDirection='column' alignItems='center'>
            <Box
              position='relative'
              bgcolor='#def'
              width={JUG_WIDTH}
              height={JUG_HEIGHT}
              border='1px solid rgba(0, 0, 0, .2)'
              boxShadow='-1px 1px 8px rgba(0, 0, 0, .2)'
              borderRadius={12}
              overflow='hidden'
            >
              {machineState !== 'idle' &&
                jugBalls.map((ball) => (
                  <Box
                    key={ball.id}
                    ref={registerBall(ball)}
                    position='absolute'
                    top={0}
                    left={0}
                    borderRadius='100%'
                    bgcolor={ball.color}
                    width={BALL_SIZE}
                    height={BALL_SIZE}
                    border='1px solid rgba(0, 0, 0, .2)'
                    boxShadow='0 0 2px rgba(0, 0, 0, .4)'
                    sx={{
                      willChange: 'transform',
                    }}
                  />
                ))}
            </Box>

            <Box position='relative' width={300} height={150}>
              <Box
                position='absolute'
                top={10}
                left={10}
                display='flex'
                alignItems='center'
                gap={0.75}
                onClick={canTogglePower ? handleTogglePower : undefined}
                role={canTogglePower ? 'button' : undefined}
                aria-label={canTogglePower ? 'Toggle machine power' : undefined}
                aria-pressed={machineState === 'running'}
                tabIndex={canTogglePower ? 0 : -1}
                onKeyDown={(e) => {
                  if (canTogglePower && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleTogglePower();
                  }
                }}
                sx={{
                  cursor: canTogglePower ? 'pointer' : 'default',
                  zIndex: 1,
                  userSelect: 'none',
                  opacity: canTogglePower ? 1 : 0.45,
                  transition: 'opacity 200ms ease',
                  '&:focus-visible': {
                    outline: '2px solid #1976d2',
                    outlineOffset: 2,
                  },
                }}
              >
                <Box
                  width={22}
                  height={12}
                  borderRadius={0.5}
                  sx={{
                    bgcolor: machineState === 'running' ? '#ff3b3b' : '#5a1a1a',
                    border: '1px solid rgba(0, 0, 0, .5)',
                    boxShadow:
                      machineState === 'running'
                        ? '0 0 6px 1px rgba(255, 59, 59, .85), inset 0 -1px 2px rgba(0, 0, 0, .3)'
                        : 'inset 0 1px 2px rgba(0, 0, 0, .5)',
                    transition:
                      'background-color 200ms ease, box-shadow 200ms ease',
                  }}
                />
                <Typography
                  fontSize='0.7rem'
                  fontWeight={700}
                  sx={{
                    color: '#333',
                    letterSpacing: '0.05em',
                  }}
                >
                  ON/OFF
                </Typography>
              </Box>
              <Box
                bgcolor='#ccc'
                width={300}
                height={150}
                border='1px solid rgba(0, 0, 0, .2)'
                boxShadow='-1px 1px 8px rgba(0, 0, 0, .2)'
                borderRadius={1}
                display='flex'
                alignItems='center'
                justifyContent='center'
              ></Box>
              <Typography
                position='absolute'
                bottom={6}
                left={10}
                fontSize='0.7rem'
                fontStyle='italic'
                sx={{
                  color: 'rgba(0, 0, 0, .45)',
                  letterSpacing: '0.02em',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              >
                Skillmanator 3000
              </Typography>
              <Box
                position='absolute'
                right={-50}
                top='50%'
                display='flex'
                alignItems='center'
                onClick={canPull ? handlePullBall : undefined}
                role={canPull ? 'button' : undefined}
                aria-label={canPull ? 'Pull ball' : undefined}
                aria-disabled={!canPull}
                tabIndex={canPull ? 0 : -1}
                onKeyDown={(e) => {
                  if (canPull && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handlePullBall();
                  }
                }}
                sx={{
                  transform: 'translateY(-50%)',
                  cursor: canPull ? 'pointer' : 'default',
                  transition: 'filter 120ms ease',
                  '&:hover': canPull
                    ? {
                        filter: 'brightness(1.08)',
                      }
                    : {},
                  '&:focus-visible': {
                    outline: '2px solid #1976d2',
                    outlineOffset: 2,
                  },
                }}
              >
                <Box
                  width={64}
                  height={BALL_SIZE + 8}
                  bgcolor='#fff'
                  borderRadius='0 4px 4px 0'
                  display='flex'
                  alignItems='center'
                  justifyContent='center'
                  position='relative'
                  sx={{
                    borderTop: '1px solid #bfbfbf',
                    borderRight: '1px solid #bfbfbf',
                    borderBottom: '1px solid #bfbfbf',
                    borderLeft: 'none',
                  }}
                >
                  <Typography
                    fontSize='0.75em'
                    fontWeight={700}
                    sx={{
                      color: '#2e7d32',
                      letterSpacing: '0.05em',
                      userSelect: 'none',
                      opacity: canPull ? 1 : 0.3,
                      transition: 'opacity 200ms ease',
                    }}
                  >
                    PULL
                  </Typography>
                  <Box
                    position='absolute'
                    left={-6}
                    top={-1}
                    width={10}
                    height={BALL_SIZE + 8}
                    borderRadius='50%'
                    bgcolor='#fff'
                    sx={{
                      zIndex: -1,
                      borderTop: '1px solid #bfbfbf',
                      borderLeft: '1px solid #bfbfbf',
                      borderBottom: '1px solid #bfbfbf',
                      borderRight: 'none',
                    }}
                  />
                  <Box
                    position='absolute'
                    right={-4}
                    top='50%'
                    width={10}
                    height={BALL_SIZE + 6}
                    borderRadius='50%'
                    bgcolor='#444'
                    border='1px solid rgba(0, 0, 0, .4)'
                    boxShadow='inset 0 2px 4px rgba(0, 0, 0, .5)'
                    sx={{ transform: 'translateY(-50%)' }}
                  />
                  {displayedBall && (
                    <Box
                      position='absolute'
                      top='50%'
                      width={BALL_SIZE + 4}
                      height={BALL_SIZE + 4}
                      sx={{
                        right: -(BALL_SIZE + 4) - 80,
                        transform: `translateY(-${(BALL_SIZE + 4) / 2}px)`,
                        opacity: displayedBallVisible ? 1 : 0,
                        transition: 'opacity 600ms ease',
                        pointerEvents: 'none',
                      }}
                    >
                      <Box
                        width={BALL_SIZE + 4}
                        height={BALL_SIZE + 4}
                        borderRadius='100%'
                        bgcolor={displayedBall.color}
                        border='1px solid rgba(0, 0, 0, .25)'
                        boxShadow='0 2px 6px rgba(0, 0, 0, .3)'
                      />
                      {(() => {
                        const team = find(
                          teams,
                          (t: Team) => t.color === displayedBall.color,
                        );
                        const teamName = get(team, 'name', displayedBall.color);
                        return (
                          <Typography
                            fontWeight={500}
                            fontSize='1.15em'
                            whiteSpace='nowrap'
                            textAlign='center'
                            sx={{
                              textTransform: 'uppercase',
                              position: 'absolute',
                              top: '100%',
                              left: '50%',
                              transform: 'translateX(-50%)',
                              marginTop: '12px',
                            }}
                          >
                            {teamName}!!
                          </Typography>
                        );
                      })()}
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
          </Box>

          <Button
            variant='text'
            color='warning'
            size='small'
            disabled={!canReset}
            onClick={handleResetRequest}
            sx={{ fontSize: '0.75rem', minWidth: 0 }}
          >
            Reset
          </Button>
        </Box>

        <Box
          display='flex'
          flexDirection='column'
          gap={3}
          width={380}
          flexShrink={0}
          paddingTop={1}
        >
          <Box display='flex' flexDirection='column' gap={1}>
            <Typography variant='h6' fontWeight='bold'>
              Ball Order
            </Typography>

            <Box display='grid' gridTemplateColumns={'1fr 1fr'} gap={1}>
              {Array.from({ length: totalBalls }).map((_, i) => {
                const ball = pulledBalls[i];
                const team = ball
                  ? find(teams, (t: Team) => t.color === ball.color)
                  : undefined;
                const teamName = ball ? get(team, 'name', ball.color) : '';
                return (
                  <Box key={i} display='flex' alignItems='center' gap={2}>
                    <Typography
                      width={28}
                      textAlign='right'
                      fontWeight='bold'
                      color='text.secondary'
                    >
                      {i + 1}.
                    </Typography>
                    {ball ? (
                      <Box
                        display='flex'
                        alignItems='center'
                        gap={2}
                        sx={{
                          animation: `${fadeInBall} ${PULL_FADE_MS}ms ease both`,
                          animationDelay: `${PULL_DISPLAY_MS}ms`,
                        }}
                      >
                        <Box
                          borderRadius='100%'
                          bgcolor={ball.color}
                          width={BALL_SIZE}
                          height={BALL_SIZE}
                          border='1px solid rgba(0, 0, 0, .2)'
                          boxShadow='0 0 2px rgba(0, 0, 0, .4)'
                          flexShrink={0}
                        />
                        <Typography>{teamName}</Typography>
                      </Box>
                    ) : (
                      <Box
                        borderRadius='100%'
                        width={BALL_SIZE}
                        height={BALL_SIZE}
                        border='1px dashed rgba(0, 0, 0, .25)'
                        bgcolor='rgba(0, 0, 0, .04)'
                        flexShrink={0}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>

          <Box display='flex' flexDirection='column' gap={1}>
            <Typography variant='h6' fontWeight='bold'>
              {draftTitle} Order
            </Typography>
            {draftOrder.map((team, i) => (
              <Box key={i} display='flex' alignItems='center' gap={2}>
                <Typography
                  width={28}
                  textAlign='right'
                  fontWeight='bold'
                  color='text.secondary'
                >
                  {i + 1}.
                </Typography>
                {team ? (
                  <>
                    <Box
                      borderRadius='100%'
                      bgcolor={team.color}
                      width={BALL_SIZE}
                      height={BALL_SIZE}
                      border='1px solid rgba(0, 0, 0, .2)'
                      boxShadow='0 0 2px rgba(0, 0, 0, .4)'
                      flexShrink={0}
                    />
                    <Typography>{team.name}</Typography>
                  </>
                ) : (
                  <Box
                    height={BALL_SIZE}
                    flex={1}
                    borderRadius={4}
                    border='1px dashed rgba(0, 0, 0, .25)'
                    bgcolor='rgba(0, 0, 0, .04)'
                  />
                )}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Dialog open={resetDialogOpen} onClose={handleResetCancel}>
        <DialogTitle>Reset lottery?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to reset? All pulled balls will be cleared.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleResetCancel}>Cancel</Button>
          <Button
            onClick={handleResetConfirm}
            variant='contained'
            color='error'
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
