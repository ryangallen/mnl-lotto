'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

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

type Ball = {
  color: string;
};

type Team = {
  name: string;
  color: string;
  balls: Ball[];
};

type MachineState = 'idle' | 'running' | 'finished';

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

const createNBalls = (n: number, color: string) =>
  [...Array(n)].map(() => ({ color }));

const DEFAULT_BALL_COUNT = 2;
const PULL_DISPLAY_MS = 1500;
const PULL_FADE_MS = 600;

const fadeInBall = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;
const DEFAULT_TEAMS = [
  { name: 'Whalers', color: '#7D8385' },
  { name: 'North Stars', color: '#00834B' },
  { name: 'Tigers', color: '#FFAE2F' },
  { name: 'Golden Seals', color: '#07A7B5' },
  { name: 'Nordiques', color: '#043787' },
  { name: 'Americans', color: '#FFF' },
  { name: 'Scouts', color: '#C90011' },
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
        (team: Team) => team.name === name
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
  const [jugBalls, setJugBalls] = useState<Ball[]>([]);
  const [pulledBalls, setPulledBalls] = useState<Ball[]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [displayedBall, setDisplayedBall] = useState<Ball | null>(null);
  const [displayedBallVisible, setDisplayedBallVisible] = useState(false);
  const [pullLocked, setPullLocked] = useState(false);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setDisplayedBallVisible(false);
    setDisplayedBall(null);
    setPullLocked(false);
  }, []);

  useEffect(
    () => () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
      if (lockTimeoutRef.current) clearTimeout(lockTimeoutRef.current);
    },
    []
  );

  const totalBalls = useMemo(
    () => teams.reduce((sum, t) => sum + t.balls.length, 0),
    [teams]
  );

  const draftOrder = useMemo<(Team | null)[]>(() => {
    const slots: (Team | null)[] = teams.map(() => null);
    if (teams.length === 0) return slots;

    const pulledByColor = new Map<string, number>();
    const eliminationOrder: Team[] = [];

    for (const ball of pulledBalls) {
      const next = (pulledByColor.get(ball.color) ?? 0) + 1;
      pulledByColor.set(ball.color, next);
      const team = find(teams, (t: Team) => t.color === ball.color);
      if (team && next === team.balls.length && !find(eliminationOrder, (t) => t.color === team.color)) {
        eliminationOrder.push(team);
      }
    }

    eliminationOrder.forEach((team, i) => {
      const slotIdx = teams.length - 1 - i;
      if (slotIdx >= 0) slots[slotIdx] = team;
    });

    const unassigned = teams.filter(
      (t) => !find(eliminationOrder, (e) => e.color === t.color)
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
        }))
      );
      if (machineState !== 'idle') {
        setMachineState('idle');
        setJugBalls([]);
        setPulledBalls([]);
        clearDisplayedBall();
      }
    },
    [machineState, clearDisplayedBall]
  );

  const handleTeamsChange = useCallback(
    (str: string) => {
      setTeams(teamsFromString(str, ballCount));
      if (machineState !== 'idle') {
        setMachineState('idle');
        setJugBalls([]);
        setPulledBalls([]);
        clearDisplayedBall();
      }
    },
    [machineState, ballCount, clearDisplayedBall]
  );

  const handleStart = useCallback(() => {
    const allBalls = teams.flatMap((t) => t.balls);
    const shuffled = [...allBalls].sort(() => Math.random() - 0.5);
    setJugBalls(shuffled);
    setPulledBalls([]);
    setMachineState('running');
    clearDisplayedBall();
  }, [teams, clearDisplayedBall]);

  const handlePullBall = useCallback(() => {
    if (jugBalls.length === 0 || pullLocked) return;
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
    clearDisplayedBall();
  }, [clearDisplayedBall]);

  const canStart = machineState === 'idle' && totalBalls > 0;
  const canPull = machineState === 'running' && jugBalls.length > 0 && !pullLocked;
  const canReset = machineState !== 'idle' || pulledBalls.length > 0;

  const BALL_SIZE = 24;

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
        textAlign='center'
        marginBottom={2}
      >
        MNL Draft Lottery
      </Typography>

      <TextField
        fullWidth
        size='small'
        label='Draft Title'
        variant='outlined'
        defaultValue={draftTitle}
        onChange={(event) => setDraftTitle(event.target.value)}
      />
      <TextField
        fullWidth
        type='number'
        size='small'
        label='Balls per team'
        variant='outlined'
        defaultValue={ballCount}
        onChange={(event) => handleBallCountChange(Number(event.target.value))}
      />
      <TextField
        fullWidth
        size='small'
        label='Teams'
        variant='outlined'
        defaultValue={teams.map(({ name }) => name).join(', ')}
        onChange={(event) => handleTeamsChange(event.target.value)}
      />

      <Divider />

      <Box
        display='flex'
        flexDirection='row'
        alignItems='flex-start'
        justifyContent='center'
        gap={6}
        flexWrap='wrap'
      >
        <Box
          width={280}
          flexShrink={0}
          paddingTop={1}
          sx={{
            visibility: machineState === 'idle' ? 'visible' : 'hidden',
          }}
        >
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
              <Box component='li' key={name} display='flex' alignItems='center' gap={1}>
                <Typography>{name}</Typography>
                {balls.map(({ color }, i) => (
                  <Box
                    key={`${color}-${i}`}
                    borderRadius='100%'
                    bgcolor={color}
                    width={20}
                    height={20}
                    border='1px solid rgba(0, 0, 0, .2)'
                    boxShadow='0 0 2px rgba(0, 0, 0, .4)'
                  />
                ))}
              </Box>
            ))}
          </Box>
        </Box>

        <Box
          display='flex'
          flexDirection='column'
          alignItems='center'
          gap={2}
          marginRight={24}
        >
        <Box display='flex' flexDirection='column' alignItems='center'>
        <Box
          position='relative'
          bgcolor='#def'
          width={300}
          height={500}
          border='1px solid rgba(0, 0, 0, .2)'
          boxShadow='-1px 1px 8px rgba(0, 0, 0, .2)'
          borderRadius={12}
          display='flex'
          flexDirection='row'
          flexWrap='wrap'
          gap={1}
          padding={2}
          alignContent='flex-end'
        >
          {machineState !== 'idle' &&
            jugBalls.map((ball, i) => (
              <Box
                key={i}
                borderRadius='100%'
                bgcolor={ball.color}
                width={BALL_SIZE}
                height={BALL_SIZE}
                border='1px solid rgba(0, 0, 0, .2)'
                boxShadow='0 0 2px rgba(0, 0, 0, .4)'
                flexShrink={0}
              />
            ))}
        </Box>

        <Box position='relative' width={300} height={150}>
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
          >
            {machineState === 'idle' && (
              <Button
                variant='contained'
                color='success'
                size='large'
                disabled={!canStart}
                onClick={handleStart}
              >
                Start
              </Button>
            )}
          </Box>
          <Box
            position='absolute'
            right={-52}
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
              opacity: machineState === 'running' ? 1 : 0.85,
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
              width={52}
              height={BALL_SIZE + 8}
              bgcolor='#fff'
              border='1px solid rgba(0, 0, 0, .25)'
              borderRadius='0 4px 4px 0'
              boxShadow='-1px 1px 4px rgba(0, 0, 0, .2)'
              display='flex'
              alignItems='center'
              justifyContent='center'
              position='relative'
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
                right={-4}
                top='50%'
                width={10}
                height={BALL_SIZE + 4}
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
                      (t: Team) => t.color === displayedBall.color
                    );
                    const teamName = get(team, 'name', displayedBall.color);
                    return (
                      <Typography
                        fontWeight={500}
                        fontSize='0.85em'
                        whiteSpace='nowrap'
                        textAlign='center'
                        sx={{
                          textTransform: 'uppercase',
                          position: 'absolute',
                          top: '100%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          marginTop: '4px',
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
          variant='outlined'
          color='warning'
          disabled={!canReset}
          onClick={handleResetRequest}
        >
          Reset
        </Button>
        </Box>

        <Box
          display='flex'
          flexDirection='column'
          gap={3}
          width={280}
          flexShrink={0}
          paddingTop={1}
        >
          <Box display='flex' flexDirection='column' gap={1}>
            <Typography variant='h6' fontWeight='bold'>
              Ball Order
            </Typography>
            {Array.from({ length: totalBalls }).map((_, i) => {
              const ball = pulledBalls[i];
              const team = ball
                ? find(teams, (t: Team) => t.color === ball.color)
                : undefined;
              const teamName = ball ? get(team, 'name', ball.color) : '';
              return (
                <Box
                  key={i}
                  display='flex'
                  alignItems='center'
                  gap={2}
                >
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
          <Button onClick={handleResetConfirm} variant='contained' color='error'>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
