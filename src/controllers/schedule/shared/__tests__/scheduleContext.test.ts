import { Types } from 'mongoose';
import {
  parseTournamentScheduleContext,
  parseTournamentScheduleDocument,
  mongoObjectIdSchema,
} from '../scheduleContext.schema';

function makeId() {
  return new Types.ObjectId();
}

function makeMinimalContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: makeId(),
    name: 'Test Tournament',
    minMember: 2,
    firstRoundScheduledAt: null,
    tournamentMode: 'singleDay',
    date: new Date('2025-06-01T00:00:00Z'),
    startTime: '09:00',
    endTime: '17:00',
    timezone: 'UTC',
    duration: 60,
    breakDuration: 15,
    totalRounds: 3,
    playMode: 'TieBreak10',
    createdBy: makeId(),
    club: null,
    participants: [],
    schedule: null,
    ...overrides,
  };
}

function makeMinimalDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: makeId(),
    status: 'active',
    currentRound: 1,
    matchesPerPlayer: 2,
    matchDurationMinutes: 45,
    breakTimeMinutes: 15,
    rounds: [],
    ...overrides,
  };
}

describe('mongoObjectIdSchema', () => {
  it('accepts only mongoose ObjectId instances, not plain hex strings', () => {
    const id = makeId();

    expect(mongoObjectIdSchema.parse(id)).toBe(id);
    expect(() => mongoObjectIdSchema.parse(id.toString())).toThrow();
  });
});

describe('parseTournamentScheduleContext()', () => {
  it('preserves populated club and participant fields used by scheduling', () => {
    const courtId = makeId();
    const participantId = makeId();

    const result = parseTournamentScheduleContext(
      makeMinimalContext({
        club: {
          _id: makeId(),
          courts: [{ _id: courtId, name: 'Court 1' }],
        },
        participants: [
          {
            _id: participantId,
            name: 'Alice',
            alias: 'ace',
            profilePictureUrl: null,
            elo: { rating: 1500, rd: 200 },
          },
        ],
      })
    );

    expect(result.club?.courts[0]._id).toBe(courtId);
    expect(result.participants[0]).toMatchObject({
      _id: participantId,
      alias: 'ace',
      elo: { rating: 1500, rd: 200 },
    });
  });

  it('enforces tournament enums and scheduling boundaries', () => {
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ tournamentMode: 'roundRobin' }))).toThrow(
      'Invalid tournament schedule context'
    );
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ playMode: 'singles' }))).toThrow(
      'Invalid tournament schedule context'
    );
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ totalRounds: 0 }))).toThrow(
      'Invalid tournament schedule context'
    );
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ totalRounds: 101 }))).toThrow(
      'Invalid tournament schedule context'
    );
  });

  it('rejects duration values outside the project 5-minute scheduling grid', () => {
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ duration: 7 }))).toThrow(
      'Invalid tournament schedule context'
    );
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ duration: 125 }))).toThrow(
      'Invalid tournament schedule context'
    );
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ breakDuration: 121 }))).toThrow(
      'Invalid tournament schedule context'
    );
  });
});

describe('parseTournamentScheduleDocument()', () => {
  it('normalizes optional schedule counts to downstream-safe values', () => {
    const result = parseTournamentScheduleDocument(
      makeMinimalDocument({
        matchesPerPlayer: null,
        matchDurationMinutes: undefined,
        breakTimeMinutes: null,
      })
    );

    expect(result.matchesPerPlayer).toBe(1);
    expect(result.matchDurationMinutes).toBeNull();
    expect(result.breakTimeMinutes).toBeNull();
  });

  it('preserves round ordering and ObjectId values for generated schedule rounds', () => {
    const firstGame = makeId();
    const secondGame = makeId();
    const result = parseTournamentScheduleDocument(
      makeMinimalDocument({
        rounds: [
          { game: firstGame, slot: 1, round: 1 },
          { game: secondGame, slot: 2, round: 1 },
        ],
      })
    );

    expect(result.rounds.map((round) => round.game)).toEqual([firstGame, secondGame]);
  });

  it('enforces match duration grid and round entry invariants', () => {
    expect(() => parseTournamentScheduleDocument(makeMinimalDocument({ matchDurationMinutes: 7 }))).toThrow(
      'Invalid schedule document'
    );
    expect(() =>
      parseTournamentScheduleDocument(
        makeMinimalDocument({
          rounds: [{ game: 'not-an-objectid', slot: 1, round: 1 }],
        })
      )
    ).toThrow('Invalid schedule document');
    expect(() =>
      parseTournamentScheduleDocument(
        makeMinimalDocument({
          rounds: [{ game: makeId(), slot: 0, round: 1 }],
        })
      )
    ).toThrow('Invalid schedule document');
  });
});
