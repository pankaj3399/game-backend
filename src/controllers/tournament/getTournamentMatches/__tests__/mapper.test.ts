import { Types } from 'mongoose';
import { mapTournamentMatchesResponse } from '../mapper';
import type {
  GameForMatchesDoc,
  ScheduleForMatchesDoc,
  ScheduleRoundDoc,
} from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeId(): Types.ObjectId {
  return new Types.ObjectId();
}

function makePlayer(id: Types.ObjectId = makeId()) {
  return {
    _id: id,
    name: 'Player',
    alias: null,
    profilePictureUrl: null,
  };
}

function makeGame(
  overrides: Partial<GameForMatchesDoc> = {}
): GameForMatchesDoc {
  const player1 = makePlayer();
  const player2 = makePlayer();

  return {
    _id: makeId(),
    side1: { players: [player1], playerSnapshots: [] },
    side2: { players: [player2], playerSnapshots: [] },
    status: 'active',
    matchType: 'singles',
    playMode: 'TieBreak10',
    score: { playerOneScores: [], playerTwoScores: [] },
    court: null,
    startTime: null,
    ...overrides,
  };
}

function makeRoundEntry(gameId: Types.ObjectId, round: number, slot: number): ScheduleRoundDoc {
  return { game: gameId, round, slot };
}

function makeSchedule(
  rounds: ScheduleRoundDoc[],
  overrides: Partial<ScheduleForMatchesDoc> = {}
): ScheduleForMatchesDoc {
  return {
    _id: makeId(),
    status: 'active',
    currentRound: 1,
    rounds,
    ...overrides,
  };
}

// ── mapTournamentMatchesResponse ──────────────────────────────────────────────

describe('mapTournamentMatchesResponse()', () => {
  it('returns schedule metadata when null schedule is provided', () => {
    const result = mapTournamentMatchesResponse(null, [], 3);
    expect(result.schedule.id).toBeNull();
    expect(result.schedule.status).toBeNull();
    expect(result.schedule.currentRound).toBe(1);
    expect(result.schedule.totalRounds).toBe(3);
    expect(result.matches).toHaveLength(0);
  });

  it('maps a single game that appears in the schedule', () => {
    const game = makeGame();
    const round = makeRoundEntry(game._id, 1, 1);
    const schedule = makeSchedule([round]);

    const result = mapTournamentMatchesResponse(schedule, [game], 3);

    expect(result.matches).toHaveLength(1);
    const match = result.matches[0];
    expect(match.id).toBe(game._id.toString());
    expect(match.round).toBe(1);
    expect(match.slot).toBe(1);
    expect(match.mode).toBe('singles');
    expect(match.playMode).toBe('TieBreak10');
  });

  it('maps game status correctly (active → inProgress)', () => {
    const game = makeGame({ status: 'active' });
    const round = makeRoundEntry(game._id, 1, 1);
    const schedule = makeSchedule([round]);

    const result = mapTournamentMatchesResponse(schedule, [game], 1);
    expect(result.matches[0].status).toBe('inProgress');
  });

  it('maps game status correctly (finished → completed)', () => {
    const game = makeGame({ status: 'finished' });
    const round = makeRoundEntry(game._id, 1, 1);
    const schedule = makeSchedule([round]);

    const result = mapTournamentMatchesResponse(schedule, [game], 1);
    expect(result.matches[0].status).toBe('completed');
  });

  it('maps game status correctly (pendingScore → pendingScore)', () => {
    const game = makeGame({ status: 'pendingScore' });
    const round = makeRoundEntry(game._id, 1, 1);
    const schedule = makeSchedule([round]);

    const result = mapTournamentMatchesResponse(schedule, [game], 1);
    expect(result.matches[0].status).toBe('pendingScore');
  });

  it('maps game status correctly (cancelled → cancelled)', () => {
    const game = makeGame({ status: 'cancelled' });
    const round = makeRoundEntry(game._id, 1, 1);
    const schedule = makeSchedule([round]);

    const result = mapTournamentMatchesResponse(schedule, [game], 1);
    expect(result.matches[0].status).toBe('cancelled');
  });

  it('maps game status correctly (draft → scheduled)', () => {
    const game = makeGame({ status: 'draft' });
    const round = makeRoundEntry(game._id, 1, 1);
    const schedule = makeSchedule([round]);

    const result = mapTournamentMatchesResponse(schedule, [game], 1);
    expect(result.matches[0].status).toBe('scheduled');
  });

  it('maps match playMode values correctly', () => {
    const modes = ['TieBreak10', '1set', '3set', '3setTieBreak10', '5set'] as const;
    for (const mode of modes) {
      const game = makeGame({ playMode: mode });
      const round = makeRoundEntry(game._id, 1, 1);
      const result = mapTournamentMatchesResponse(makeSchedule([round]), [game], 1);
      expect(result.matches[0].playMode).toBe(mode);
    }
  });

  it('falls back playMode to TieBreak10 for unknown values', () => {
    const game = makeGame({ playMode: 'unknown' as never });
    const round = makeRoundEntry(game._id, 1, 1);
    const result = mapTournamentMatchesResponse(makeSchedule([round]), [game], 1);
    expect(result.matches[0].playMode).toBe('TieBreak10');
  });

  it('sorts matches by round then slot then id', () => {
    const g1 = makeGame();
    const g2 = makeGame();
    const g3 = makeGame();

    // Deliberately add them out of order
    const schedule = makeSchedule([
      makeRoundEntry(g3._id, 2, 1),
      makeRoundEntry(g1._id, 1, 1),
      makeRoundEntry(g2._id, 1, 2),
    ]);

    const result = mapTournamentMatchesResponse(schedule, [g1, g2, g3], 2);

    const rounds = result.matches.map((m) => m.round);
    expect(rounds).toEqual([1, 1, 2]);
    const slotsRound1 = result.matches.filter((m) => m.round === 1).map((m) => m.slot);
    expect(slotsRound1).toEqual([1, 2]);
  });

  it('skips round entries where the game does not exist in the provided games array', () => {
    const game = makeGame();
    const ghostId = makeId();
    const schedule = makeSchedule([
      makeRoundEntry(game._id, 1, 1),
      makeRoundEntry(ghostId, 1, 2),
    ]);

    const result = mapTournamentMatchesResponse(schedule, [game], 1);
    expect(result.matches).toHaveLength(1);
  });

  it('skips games with missing side1 or side2', () => {
    const game = {
      ...makeGame(),
      side1: { players: [], playerSnapshots: [] },
      side2: { players: [], playerSnapshots: [] },
    };
    const round = makeRoundEntry(game._id, 1, 1);
    const result = mapTournamentMatchesResponse(makeSchedule([round]), [game], 1);
    // Empty teams → mapGameToMatch returns null → omitted
    expect(result.matches).toHaveLength(0);
  });

  it('maps court info when court is present', () => {
    const courtId = makeId();
    const game = makeGame({
      court: { _id: courtId, name: 'Centre Court' },
    });
    const round = makeRoundEntry(game._id, 1, 1);
    const result = mapTournamentMatchesResponse(makeSchedule([round]), [game], 1);

    expect(result.matches[0].court.id).toBe(courtId.toString());
    expect(result.matches[0].court.name).toBe('Centre Court');
  });

  it('returns null court id/name when no court is assigned', () => {
    const game = makeGame({ court: null });
    const round = makeRoundEntry(game._id, 1, 1);
    const result = mapTournamentMatchesResponse(makeSchedule([round]), [game], 1);

    expect(result.matches[0].court.id).toBeNull();
    expect(result.matches[0].court.name).toBeNull();
  });

  it('maps score arrays when present', () => {
    const game = makeGame({
      score: { playerOneScores: [6, 4], playerTwoScores: [3, 6] },
    });
    const round = makeRoundEntry(game._id, 1, 1);
    const result = mapTournamentMatchesResponse(makeSchedule([round]), [game], 1);
    expect(result.matches[0].score.playerOneScores).toEqual([6, 4]);
    expect(result.matches[0].score.playerTwoScores).toEqual([3, 6]);
  });

  it('maps startTime to ISO string when present', () => {
    const startTime = new Date('2025-06-01T10:00:00Z');
    const game = makeGame({ startTime });
    const round = makeRoundEntry(game._id, 1, 1);
    const result = mapTournamentMatchesResponse(makeSchedule([round]), [game], 1);
    expect(result.matches[0].startTime).toBe(startTime.toISOString());
  });

  it('includes historical games not in schedule rounds', () => {
    const historicalGame: GameForMatchesDoc = {
      ...makeGame(),
      isHistorical: true,
      detachedFromRound: 2,
      detachedFromSlot: 1,
    };

    // Empty schedule — historical game is not referenced by any round entry
    const result = mapTournamentMatchesResponse(makeSchedule([]), [historicalGame], 2);
    const found = result.matches.find((m) => m.id === historicalGame._id.toString());
    expect(found).toBeDefined();
    expect(found!.isHistorical).toBe(true);
    expect(found!.round).toBe(2);
  });

  it('does not include a historical game twice if it also appears in schedule rounds', () => {
    const game: GameForMatchesDoc = {
      ...makeGame(),
      isHistorical: true,
      detachedFromRound: 1,
      detachedFromSlot: 1,
    };
    const round = makeRoundEntry(game._id, 1, 1);
    const schedule = makeSchedule([round]);

    const result = mapTournamentMatchesResponse(schedule, [game], 1);
    const count = result.matches.filter((m) => m.id === game._id.toString()).length;
    expect(count).toBe(1);
  });

  it('clamps totalRounds to at least 1', () => {
    const result = mapTournamentMatchesResponse(null, [], 0);
    expect(result.schedule.totalRounds).toBe(1);
  });

  it('doubles matches include side1 and side2 arrays', () => {
    const p1 = makePlayer();
    const p2 = makePlayer();
    const p3 = makePlayer();
    const p4 = makePlayer();

    const game = makeGame({
      matchType: 'doubles',
      side1: { players: [p1, p2], playerSnapshots: [] },
      side2: { players: [p3, p4], playerSnapshots: [] },
    });
    const round = makeRoundEntry(game._id, 1, 1);
    const result = mapTournamentMatchesResponse(makeSchedule([round]), [game], 1);

    const match = result.matches[0];
    expect(match.mode).toBe('doubles');
    expect(match.side1).toHaveLength(2);
    expect(match.side2).toHaveLength(2);
  });
});
