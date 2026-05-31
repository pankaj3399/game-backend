import { Types } from 'mongoose';
import { mapLiveMatchItem, toResponseStatus } from '../mapper';
import type { LiveMatchGameDoc, PopulatedPlayer } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeId(): Types.ObjectId {
  return new Types.ObjectId();
}

function makePopulatedPlayer(
  id: Types.ObjectId = makeId(),
  name: string | null = 'Player',
  alias: string | null = null
): PopulatedPlayer {
  return {
    _id: id,
    name,
    alias,
    profilePictureUrl: null,
  };
}

function makeGame(
  userId: string,
  overrides: Partial<LiveMatchGameDoc> = {}
): LiveMatchGameDoc {
  const id = makeId();
  const player1Id = new Types.ObjectId(userId);
  const player2 = makePopulatedPlayer();

  return {
    _id: id,
    tournament: { _id: makeId(), name: 'Test Tournament' },
    matchType: 'singles',
    playMode: 'TieBreak10',
    status: 'active',
    startTime: new Date('2025-06-01T10:00:00Z'),
    court: null,
    score: { playerOneScores: [], playerTwoScores: [] },
    side1: { players: [makePopulatedPlayer(player1Id, 'User Player')] },
    side2: { players: [player2] },
    detachedFromRound: null,
    schedule: null,
    ...overrides,
  } as unknown as LiveMatchGameDoc;
}

// ── toResponseStatus ──────────────────────────────────────────────────────────

describe('toResponseStatus()', () => {
  it('maps "finished" → "completed"', () => {
    expect(toResponseStatus('finished')).toBe('completed');
  });

  it('maps "pendingScore" → "pendingScore"', () => {
    expect(toResponseStatus('pendingScore')).toBe('pendingScore');
  });

  it('maps "active" → "inProgress"', () => {
    expect(toResponseStatus('active')).toBe('inProgress');
  });

  it('maps "cancelled" → "cancelled"', () => {
    expect(toResponseStatus('cancelled')).toBe('cancelled');
  });

  it('maps "draft" → "scheduled"', () => {
    expect(toResponseStatus('draft')).toBe('scheduled');
  });

  it('maps "inactive" → "scheduled"', () => {
    expect(toResponseStatus('inactive')).toBe('scheduled');
  });
});

// ── mapLiveMatchItem ──────────────────────────────────────────────────────────

describe('mapLiveMatchItem()', () => {
  const userId = makeId().toHexString();

  it('returns the correct top-level shape', () => {
    const game = makeGame(userId);
    const result = mapLiveMatchItem(game, userId);

    expect(result.id).toBe(game._id.toString());
    expect(result.mode).toBe('singles');
    expect(result.playMode).toBe('TieBreak10');
    expect(result.status).toBe('inProgress');
    expect(result.startTime).toBe('2025-06-01T10:00:00.000Z');
  });

  it('returns tournament name and id', () => {
    const game = makeGame(userId);
    const result = mapLiveMatchItem(game, userId);

    expect(result.tournament.name).toBe('Test Tournament');
    expect(result.tournament.id).toBe((game.tournament as any)._id.toString());
  });

  it('places the session user on myTeam', () => {
    const game = makeGame(userId);
    const result = mapLiveMatchItem(game, userId);

    const myIds = result.myTeam.map((p) => p.id);
    expect(myIds).toContain(userId);
  });

  it('places the opponent on opponentTeam', () => {
    const game = makeGame(userId);
    const result = mapLiveMatchItem(game, userId);

    const opponentIds = result.opponentTeam.map((p) => p.id);
    // opponentTeam should NOT contain the session user
    expect(opponentIds).not.toContain(userId);
  });

  it('defaults to side1 as myTeam when session user is not found in either side', () => {
    const unknownUserId = makeId().toHexString();
    const game = makeGame(userId); // userId in side1
    const result = mapLiveMatchItem(game, unknownUserId);

    // Falls back to side1 as myTeam when user not found
    expect(result.myTeam.length).toBeGreaterThan(0);
    expect(result.opponentTeam.length).toBeGreaterThan(0);
  });

  it('swaps team perspective when session user is in side2', () => {
    const side2UserId = makeId();
    const game = makeGame(userId, {
      side2: { players: [makePopulatedPlayer(side2UserId, 'Side2 Player')] },
    } as unknown as Partial<LiveMatchGameDoc>);

    const result = mapLiveMatchItem(game, side2UserId.toHexString());
    expect(result.myTeam[0].id).toBe(side2UserId.toString());
    expect(result.opponentTeam[0].id).toBe(userId);
  });

  it('resolves round from detachedFromRound when set', () => {
    const game = makeGame(userId, { detachedFromRound: 3 } as unknown as Partial<LiveMatchGameDoc>);
    const result = mapLiveMatchItem(game, userId);
    expect(result.round).toBe(3);
  });

  it('resolves round from schedule.rounds when detachedFromRound is not set', () => {
    const gameId = makeId();
    const game: LiveMatchGameDoc = {
      ...makeGame(userId),
      _id: gameId,
      detachedFromRound: null,
      schedule: {
        rounds: [{ game: gameId, round: 2, slot: 1 }],
      },
    } as unknown as LiveMatchGameDoc;

    const result = mapLiveMatchItem(game, userId);
    expect(result.round).toBe(2);
  });

  it('returns null round when neither detachedFromRound nor schedule is available', () => {
    const game = makeGame(userId, {
      detachedFromRound: null,
      schedule: null,
    } as unknown as Partial<LiveMatchGameDoc>);
    const result = mapLiveMatchItem(game, userId);
    expect(result.round).toBeNull();
  });

  it('returns null startTime when startTime is not set', () => {
    const game = makeGame(userId, { startTime: null } as unknown as Partial<LiveMatchGameDoc>);
    const result = mapLiveMatchItem(game, userId);
    expect(result.startTime).toBeNull();
  });

  it('maps court id and name when court is present', () => {
    const courtId = makeId();
    const game = makeGame(userId, {
      court: { _id: courtId, name: 'Centre Court' },
    } as unknown as Partial<LiveMatchGameDoc>);
    const result = mapLiveMatchItem(game, userId);
    expect(result.court.id).toBe(courtId.toString());
    expect(result.court.name).toBe('Centre Court');
  });

  it('returns null court id/name when court is null', () => {
    const game = makeGame(userId, { court: null } as unknown as Partial<LiveMatchGameDoc>);
    const result = mapLiveMatchItem(game, userId);
    expect(result.court.id).toBeNull();
    expect(result.court.name).toBeNull();
  });

  it('maps score arrays from the game', () => {
    const game = makeGame(userId, {
      score: { playerOneScores: [10], playerTwoScores: [5] },
    } as unknown as Partial<LiveMatchGameDoc>);
    const result = mapLiveMatchItem(game, userId);
    expect(result.score.playerOneScores).toEqual([10]);
    expect(result.score.playerTwoScores).toEqual([5]);
  });

  it('normalizes display names (trims whitespace)', () => {
    const player1 = makePopulatedPlayer(makeId(), '  Alice  ', '  ali  ');
    const game = makeGame(userId, {
      side1: { players: [player1] },
    } as unknown as Partial<LiveMatchGameDoc>);
    const result = mapLiveMatchItem(game, player1._id.toHexString());
    expect(result.myTeam[0].name).toBe('Alice');
    expect(result.myTeam[0].alias).toBe('ali');
  });

  it('returns null name/alias for players with empty strings', () => {
    const player1 = makePopulatedPlayer(makeId(), '', '   ');
    const game = makeGame(userId, {
      side1: { players: [player1] },
    } as unknown as Partial<LiveMatchGameDoc>);
    const result = mapLiveMatchItem(game, player1._id.toHexString());
    expect(result.myTeam[0].name).toBeNull();
    expect(result.myTeam[0].alias).toBeNull();
  });

  it('uses "[Deleted/Unknown Tournament]" when tournament name is missing', () => {
    const game: LiveMatchGameDoc = {
      ...makeGame(userId),
      tournament: { _id: makeId(), name: '' },
    } as unknown as LiveMatchGameDoc;
    const result = mapLiveMatchItem(game, userId);
    expect(result.tournament.name).toBe('[Deleted/Unknown Tournament]');
  });
});
