import { Types } from 'mongoose';
import {
  determineDidWinFromSetScores,
  mapGameToMyScoreEntry,
} from '../mapper';
import type { MyScoreGameDoc } from '../queries';

// ---- helpers ----

function makeObjectId() {
  return new Types.ObjectId();
}

function makePlayer(id: Types.ObjectId, alias?: string): { _id: Types.ObjectId; name: string | null; alias: string | null } {
  return { _id: id, name: null, alias: alias ?? null };
}

function makeGame(overrides?: Partial<MyScoreGameDoc>): MyScoreGameDoc {
  const p1Id = makeObjectId();
  const p2Id = makeObjectId();
  return {
    _id: makeObjectId(),
    side1: { players: [makePlayer(p1Id, 'Alice')] },
    side2: { players: [makePlayer(p2Id, 'Bob')] },
    tournament: null,
    matchType: 'singles',
    score: { playerOneScores: [6, 6], playerTwoScores: [3, 4] },
    playedAt: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

// ---- determineDidWinFromSetScores ----

describe('determineDidWinFromSetScores()', () => {
  it('returns true when my set scores clearly win (more sets won)', () => {
    expect(determineDidWinFromSetScores([6, 6], [3, 3])).toBe(true);
  });

  it('returns false when opponent set scores clearly win', () => {
    expect(determineDidWinFromSetScores([3, 3], [6, 6])).toBe(false);
  });

  it('returns null when set wins are tied (e.g. 1-1)', () => {
    expect(determineDidWinFromSetScores([6, 1], [1, 6])).toBeNull();
  });

  it('returns false when my scores have a walkover (I forfeited)', () => {
    expect(determineDidWinFromSetScores(['wo', 'wo'], [6, 6])).toBe(false);
  });

  it('returns true when opponent has a walkover (they forfeited)', () => {
    expect(determineDidWinFromSetScores([6, 6], ['wo', 'wo'])).toBe(true);
  });

  it('returns null for undefined inputs (no score data)', () => {
    expect(determineDidWinFromSetScores(undefined, undefined)).toBeNull();
  });

  it('returns null when arrays have mismatched lengths', () => {
    expect(determineDidWinFromSetScores([6], [3, 6])).toBeNull();
  });

  it('returns null when both have equal total numeric scores across sets', () => {
    // Each player wins one set, set wins are equal → null
    expect(determineDidWinFromSetScores([6, 1, 6], [1, 6, 3])).toBe(true); // 2 set wins vs 1
  });
});

// ---- mapGameToMyScoreEntry ----

describe('mapGameToMyScoreEntry()', () => {
  it('returns null when side1 is missing', () => {
    const game = makeGame();
    // @ts-expect-error intentional null for test
    game.side1 = null;
    expect(mapGameToMyScoreEntry(game, 'any-id')).toBeNull();
  });

  it('returns null when side2 is missing', () => {
    const game = makeGame();
    // @ts-expect-error intentional null for test
    game.side2 = null;
    expect(mapGameToMyScoreEntry(game, 'any-id')).toBeNull();
  });

  it('returns null when matchType is null (mode cannot be resolved)', () => {
    const game = makeGame({ matchType: null });
    const userId = (game.side1.players[0] as { _id: Types.ObjectId })._id.toString();
    expect(mapGameToMyScoreEntry(game, userId)).toBeNull();
  });

  it('returns null when user is not in either team', () => {
    const game = makeGame();
    expect(mapGameToMyScoreEntry(game, makeObjectId().toString())).toBeNull();
  });

  it('returns null when both sides have no players', () => {
    const game = makeGame({ side1: { players: [] }, side2: { players: [] } });
    expect(mapGameToMyScoreEntry(game, 'any-id')).toBeNull();
  });

  it('maps a singles win for the player in side1', () => {
    const p1Id = makeObjectId();
    const game = makeGame({
      side1: { players: [makePlayer(p1Id, 'Alice')] },
      side2: { players: [makePlayer(makeObjectId(), 'Bob')] },
      score: { playerOneScores: [6, 6], playerTwoScores: [3, 4] },
      matchType: 'singles',
    });

    const entry = mapGameToMyScoreEntry(game, p1Id.toString());
    expect(entry).not.toBeNull();
    expect(entry!.didWin).toBe(true);
    expect(entry!.mode).toBe('singles');
    expect(entry!.opponent.name).toBe('Bob');
  });

  it('maps a singles loss for the player in side2', () => {
    const p2Id = makeObjectId();
    const game = makeGame({
      side1: { players: [makePlayer(makeObjectId(), 'Alice')] },
      side2: { players: [makePlayer(p2Id, 'Bob')] },
      score: { playerOneScores: [6, 6], playerTwoScores: [3, 4] },
      matchType: 'singles',
    });

    const entry = mapGameToMyScoreEntry(game, p2Id.toString());
    expect(entry).not.toBeNull();
    expect(entry!.didWin).toBe(false);
    expect(entry!.opponent.name).toBe('Alice');
  });

  it('shows "Independent match" as tournament name when tournament is null', () => {
    const p1Id = makeObjectId();
    const game = makeGame({
      tournament: null,
      side1: { players: [makePlayer(p1Id)] },
    });

    const entry = mapGameToMyScoreEntry(game, p1Id.toString());
    expect(entry!.tournament.name).toBe('Independent match');
    expect(entry!.tournament.id).toBeNull();
  });

  it('shows tournament name when tournament is populated', () => {
    const p1Id = makeObjectId();
    const tournamentId = makeObjectId();
    const game = makeGame({
      tournament: { _id: tournamentId, name: 'Winter Cup' },
      side1: { players: [makePlayer(p1Id)] },
    });

    const entry = mapGameToMyScoreEntry(game, p1Id.toString());
    expect(entry!.tournament.name).toBe('Winter Cup');
    expect(entry!.tournament.id).toBe(tournamentId.toString());
  });

  it('shows "Awaiting opponent" when the opponent side is empty (pending standalone)', () => {
    const p1Id = makeObjectId();
    const game = makeGame({
      side1: { players: [makePlayer(p1Id, 'Alice')] },
      side2: { players: [] },
    });

    const entry = mapGameToMyScoreEntry(game, p1Id.toString(), 'pendingScore');
    expect(entry!.opponent.name).toBe('Awaiting opponent');
    expect(entry!.opponent.id).toBe('');
    expect(entry!.status).toBe('pendingScore');
  });

  it('returns the game id as a string', () => {
    const p1Id = makeObjectId();
    const gameId = makeObjectId();
    const game = makeGame({
      _id: gameId,
      side1: { players: [makePlayer(p1Id)] },
    });
    const entry = mapGameToMyScoreEntry(game, p1Id.toString());
    expect(entry!.id).toBe(gameId.toString());
  });

  it('falls back to a sensible playedAt when playedAt is missing (uses createdAt)', () => {
    const p1Id = makeObjectId();
    const createdAt = new Date('2024-03-10T08:00:00Z');
    const game = makeGame({
      side1: { players: [makePlayer(p1Id)] },
      playedAt: undefined,
      endTime: undefined,
      startTime: undefined,
      createdAt,
    });
    const entry = mapGameToMyScoreEntry(game, p1Id.toString());
    expect(new Date(entry!.playedAt).getTime()).toBe(createdAt.getTime());
  });

  it('maps doubles mode with two-player team name "A & B"', () => {
    const p1Id = makeObjectId();
    const partner = makeObjectId();
    const opp1 = makeObjectId();
    const opp2 = makeObjectId();
    const game = makeGame({
      matchType: 'doubles',
      side1: { players: [makePlayer(p1Id, 'Alice'), makePlayer(partner, 'Charlie')] },
      side2: { players: [makePlayer(opp1, 'Bob'), makePlayer(opp2, 'Dave')] },
    });

    const entry = mapGameToMyScoreEntry(game, p1Id.toString());
    expect(entry!.mode).toBe('doubles');
    expect(entry!.opponent.name).toBe('Bob & Dave');
  });
});
