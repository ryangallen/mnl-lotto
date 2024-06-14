'use client';

import React, { useState } from 'react';

import { Box, Divider, TextField, Typography } from '@mui/material';

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
        type='number'
        size='small'
        label='Balls per team'
        variant='outlined'
        defaultValue={ballCount}
        onChange={(event) => setBallCount(Number(event.target.value))}
      />
      <TextField
        fullWidth
        size='small'
        label='Teams'
        variant='outlined'
        defaultValue={teams.map(({ name }) => name).join(', ')}
        onChange={(event) =>
          setTeams(teamsFromString(event.target.value, ballCount))
        }
      />

      <Divider />

      <ul>
        {teams.map(({ name, color, balls }) => (
          <Box component='li' key={name} display='flex' gap={1}>
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
      </ul>

      <Box display='flex' flexDirection='column' alignItems='center'>
        <Box
          bgcolor='#def'
          width={300}
          height={500}
          border='1px solid rgba(0, 0, 0, .2)'
          boxShadow='-1px 1px 8px rgba(0, 0, 0, .2)'
          borderRadius={12}
        />
        <Box
          bgcolor='#ccc'
          width={300}
          height={150}
          border='1px solid rgba(0, 0, 0, .2)'
          boxShadow='-1px 1px 8px rgba(0, 0, 0, .2)'
          borderRadius={1}
        />
      </Box>
    </Box>
  );
}
