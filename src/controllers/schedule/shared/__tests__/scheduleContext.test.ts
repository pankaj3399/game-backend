import { Types } from 'mongoose';
import {
  parseTournamentScheduleContext,
  parseTournamentScheduleDocument,
  mongoObjectIdSchema,
  scheduleParticipantInfoSchema,
  scheduleCourtInfoSchema,
  scheduleClubInfoSchema,
} from '../scheduleContext.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Factory helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeId() {
  return new Types.ObjectId();
}

/**
 * Build a minimal but fully-valid TournamentScheduleContext payload.
 * NOTE: playMode must be one of the TOURNAMENT_PLAY_MODES values:
 *   'TieBreak10' | '1set' | '3setTieBreak10' | '3set' | '5set'
 */
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
    duration: 60,          // must be 5-minute interval: 60 ✓
    breakDuration: 15,
    totalRounds: 3,
    playMode: 'TieBreak10', // must be a TOURNAMENT_PLAY_MODES value
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
    matchDurationMinutes: 45,  // 5-minute interval ✓
    breakTimeMinutes: 15,
    rounds: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// mongoObjectIdSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('mongoObjectIdSchema', () => {
  it('accepts a valid ObjectId instance', () => {
    const id = makeId();
    expect(mongoObjectIdSchema.parse(id)).toBe(id);
  });

  it('rejects a plain hex string that looks like an ObjectId', () => {
    expect(() => mongoObjectIdSchema.parse('507f1f77bcf86cd799439011')).toThrow();
  });

  it('rejects null', () => {
    expect(() => mongoObjectIdSchema.parse(null)).toThrow();
  });

  it('rejects undefined', () => {
    expect(() => mongoObjectIdSchema.parse(undefined)).toThrow();
  });

  it('rejects a plain number', () => {
    expect(() => mongoObjectIdSchema.parse(42)).toThrow();
  });

  it('rejects an empty object', () => {
    expect(() => mongoObjectIdSchema.parse({})).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scheduleCourtInfoSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('scheduleCourtInfoSchema', () => {
  it('accepts a valid court object', () => {
    const court = { _id: makeId(), name: 'Centre Court' };
    expect(() => scheduleCourtInfoSchema.parse(court)).not.toThrow();
  });

  it('rejects a court with a non-ObjectId _id', () => {
    expect(() => scheduleCourtInfoSchema.parse({ _id: 'abc', name: 'Court' })).toThrow();
  });

  it('rejects a court with a missing name', () => {
    expect(() => scheduleCourtInfoSchema.parse({ _id: makeId() })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scheduleClubInfoSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('scheduleClubInfoSchema', () => {
  it('accepts a club with an empty courts array', () => {
    const club = { _id: makeId(), courts: [] };
    expect(() => scheduleClubInfoSchema.parse(club)).not.toThrow();
  });

  it('accepts a club with valid courts', () => {
    const club = {
      _id: makeId(),
      courts: [{ _id: makeId(), name: 'Court 1' }, { _id: makeId(), name: 'Court 2' }],
    };
    expect(() => scheduleClubInfoSchema.parse(club)).not.toThrow();
  });

  it('rejects a club with an invalid court inside courts array', () => {
    const club = { _id: makeId(), courts: [{ _id: 'bad-id', name: 'Court' }] };
    expect(() => scheduleClubInfoSchema.parse(club)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scheduleParticipantInfoSchema
// ─────────────────────────────────────────────────────────────────────────────

describe('scheduleParticipantInfoSchema', () => {
  it('accepts a fully-populated participant', () => {
    const p = {
      _id: makeId(),
      name: 'Alice',
      alias: 'ace',
      profilePictureUrl: 'https://example.com/avatar.png',
      elo: { rating: 1500, rd: 200 },
    };
    expect(() => scheduleParticipantInfoSchema.parse(p)).not.toThrow();
  });

  it('accepts a participant with all nullable fields set to null', () => {
    const p = {
      _id: makeId(),
      name: null,
      alias: null,
      profilePictureUrl: null,
      elo: { rating: null, rd: null },
    };
    expect(() => scheduleParticipantInfoSchema.parse(p)).not.toThrow();
  });

  it('rejects a participant with a string _id', () => {
    const p = { _id: 'not-an-objectid', name: 'Alice', alias: null, profilePictureUrl: null, elo: { rating: 1500, rd: 200 } };
    expect(() => scheduleParticipantInfoSchema.parse(p)).toThrow();
  });

  it('rejects a participant missing the elo field', () => {
    const p = { _id: makeId(), name: 'Alice', alias: null, profilePictureUrl: null };
    expect(() => scheduleParticipantInfoSchema.parse(p)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseTournamentScheduleContext
// ─────────────────────────────────────────────────────────────────────────────

describe('parseTournamentScheduleContext()', () => {
  // ── happy paths ────────────────────────────────────────────────────────────

  it('parses a valid minimal context without throwing', () => {
    expect(() => parseTournamentScheduleContext(makeMinimalContext())).not.toThrow();
  });

  it('returns the parsed data with correct field types', () => {
    const data = makeMinimalContext({ name: 'My Tournament', totalRounds: 5 });
    const result = parseTournamentScheduleContext(data);
    expect(result.name).toBe('My Tournament');
    expect(result.totalRounds).toBe(5);
    expect(result.playMode).toBe('TieBreak10');
    expect(result.tournamentMode).toBe('singleDay');
  });

  it('accepts every valid TOURNAMENT_PLAY_MODES value', () => {
    const modes = ['TieBreak10', '1set', '3setTieBreak10', '3set', '5set'] as const;
    for (const mode of modes) {
      expect(() => parseTournamentScheduleContext(makeMinimalContext({ playMode: mode }))).not.toThrow();
    }
  });

  it('accepts every valid TOURNAMENT_MODES value', () => {
    const modes = ['singleDay', 'unscheduled'] as const;
    for (const mode of modes) {
      expect(() => parseTournamentScheduleContext(makeMinimalContext({ tournamentMode: mode }))).not.toThrow();
    }
  });

  it('accepts null date, startTime, endTime, timezone', () => {
    const data = makeMinimalContext({ date: null, startTime: null, endTime: null, timezone: null });
    expect(() => parseTournamentScheduleContext(data)).not.toThrow();
    const result = parseTournamentScheduleContext(data);
    expect(result.date).toBeNull();
    expect(result.timezone).toBeNull();
  });

  it('accepts null duration and breakDuration', () => {
    const data = makeMinimalContext({ duration: null, breakDuration: null });
    expect(() => parseTournamentScheduleContext(data)).not.toThrow();
  });

  it('accepts null club', () => {
    const data = makeMinimalContext({ club: null });
    expect(() => parseTournamentScheduleContext(data)).not.toThrow();
  });

  it('accepts a valid club with courts', () => {
    const data = makeMinimalContext({
      club: {
        _id: makeId(),
        courts: [{ _id: makeId(), name: 'Court 1' }],
      },
    });
    expect(() => parseTournamentScheduleContext(data)).not.toThrow();
  });

  it('accepts valid participants', () => {
    const data = makeMinimalContext({
      participants: [
        { _id: makeId(), name: 'Alice', alias: 'ace', profilePictureUrl: null, elo: { rating: 1500, rd: 200 } },
        { _id: makeId(), name: 'Bob', alias: null, profilePictureUrl: null, elo: { rating: 1600, rd: 150 } },
      ],
    });
    const result = parseTournamentScheduleContext(data);
    expect(result.participants).toHaveLength(2);
    expect(result.participants[0].name).toBe('Alice');
  });

  it('accepts schedule as an ObjectId or null', () => {
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ schedule: makeId() }))).not.toThrow();
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ schedule: null }))).not.toThrow();
  });

  it('accepts totalRounds at boundary values (1 and 100)', () => {
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ totalRounds: 1 }))).not.toThrow();
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ totalRounds: 100 }))).not.toThrow();
  });

  it('accepts duration values that are multiples of 5 from 5 to 120', () => {
    for (const dur of [5, 10, 60, 90, 120]) {
      expect(() => parseTournamentScheduleContext(makeMinimalContext({ duration: dur }))).not.toThrow();
    }
  });

  // ── validation failures ────────────────────────────────────────────────────

  it('throws when name is missing (undefined)', () => {
    const data = makeMinimalContext({ name: undefined });
    expect(() => parseTournamentScheduleContext(data)).toThrow('Invalid tournament schedule context');
  });

  it('throws when tournamentMode is not in the allowed enum', () => {
    const data = makeMinimalContext({ tournamentMode: 'roundRobin' });
    expect(() => parseTournamentScheduleContext(data)).toThrow('Invalid tournament schedule context');
  });

  it('throws when playMode is not in the allowed enum', () => {
    const data = makeMinimalContext({ playMode: 'singles' });
    expect(() => parseTournamentScheduleContext(data)).toThrow('Invalid tournament schedule context');
  });

  it('throws when totalRounds is below 1', () => {
    const data = makeMinimalContext({ totalRounds: 0 });
    expect(() => parseTournamentScheduleContext(data)).toThrow('Invalid tournament schedule context');
  });

  it('throws when totalRounds exceeds 100', () => {
    const data = makeMinimalContext({ totalRounds: 101 });
    expect(() => parseTournamentScheduleContext(data)).toThrow('Invalid tournament schedule context');
  });

  it('throws when duration is not a multiple of 5', () => {
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ duration: 7 }))).toThrow('Invalid tournament schedule context');
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ duration: 13 }))).toThrow('Invalid tournament schedule context');
  });

  it('throws when duration is out of range (< 5 or > 120)', () => {
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ duration: 0 }))).toThrow('Invalid tournament schedule context');
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ duration: 125 }))).toThrow('Invalid tournament schedule context');
  });

  it('throws when breakDuration is negative', () => {
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ breakDuration: -1 }))).toThrow('Invalid tournament schedule context');
  });

  it('throws when breakDuration exceeds 120', () => {
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ breakDuration: 121 }))).toThrow('Invalid tournament schedule context');
  });

  it('throws when a participant _id is not an ObjectId', () => {
    const data = makeMinimalContext({
      participants: [
        { _id: 'not-an-objectid', name: 'Alice', alias: null, profilePictureUrl: null, elo: { rating: 1500, rd: 200 } },
      ],
    });
    expect(() => parseTournamentScheduleContext(data)).toThrow('Invalid tournament schedule context');
  });

  it('throws when minMember is not a positive integer', () => {
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ minMember: 0 }))).toThrow('Invalid tournament schedule context');
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ minMember: -2 }))).toThrow('Invalid tournament schedule context');
  });

  it('throws when createdBy is not an ObjectId', () => {
    expect(() => parseTournamentScheduleContext(makeMinimalContext({ createdBy: 'plain-string' }))).toThrow('Invalid tournament schedule context');
  });

  it('throws when the entire payload is null', () => {
    expect(() => parseTournamentScheduleContext(null)).toThrow('Invalid tournament schedule context');
  });

  it('throws when the payload is an empty object', () => {
    expect(() => parseTournamentScheduleContext({})).toThrow('Invalid tournament schedule context');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseTournamentScheduleDocument
// ─────────────────────────────────────────────────────────────────────────────

describe('parseTournamentScheduleDocument()', () => {
  // ── happy paths ────────────────────────────────────────────────────────────

  it('parses a valid minimal document without throwing', () => {
    expect(() => parseTournamentScheduleDocument(makeMinimalDocument())).not.toThrow();
  });

  it('accepts every valid status value', () => {
    for (const status of ['draft', 'active', 'finished']) {
      expect(() => parseTournamentScheduleDocument(makeMinimalDocument({ status }))).not.toThrow();
    }
  });

  it('parses valid round entries correctly', () => {
    const gameId = makeId();
    const data = makeMinimalDocument({
      rounds: [{ game: gameId, slot: 1, round: 1 }],
    });
    const result = parseTournamentScheduleDocument(data);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0].game.toString()).toBe(gameId.toString());
    expect(result.rounds[0].slot).toBe(1);
    expect(result.rounds[0].round).toBe(1);
  });

  it('parses multiple rounds in order', () => {
    const rounds = [
      { game: makeId(), slot: 1, round: 1 },
      { game: makeId(), slot: 2, round: 1 },
      { game: makeId(), slot: 1, round: 2 },
    ];
    const result = parseTournamentScheduleDocument(makeMinimalDocument({ rounds }));
    expect(result.rounds).toHaveLength(3);
  });

  it('transforms null matchesPerPlayer to 1', () => {
    const result = parseTournamentScheduleDocument(makeMinimalDocument({ matchesPerPlayer: null }));
    expect(result.matchesPerPlayer).toBe(1);
  });

  it('transforms undefined matchesPerPlayer to 1', () => {
    const data = makeMinimalDocument({ matchesPerPlayer: undefined });
    const result = parseTournamentScheduleDocument(data);
    expect(result.matchesPerPlayer).toBe(1);
  });

  it('preserves explicit matchesPerPlayer value', () => {
    const result = parseTournamentScheduleDocument(makeMinimalDocument({ matchesPerPlayer: 3 }));
    expect(result.matchesPerPlayer).toBe(3);
  });

  it('transforms null matchDurationMinutes to null', () => {
    const result = parseTournamentScheduleDocument(makeMinimalDocument({ matchDurationMinutes: null }));
    expect(result.matchDurationMinutes).toBeNull();
  });

  it('transforms undefined matchDurationMinutes to null', () => {
    const result = parseTournamentScheduleDocument(makeMinimalDocument({ matchDurationMinutes: undefined }));
    expect(result.matchDurationMinutes).toBeNull();
  });

  it('transforms null breakTimeMinutes to null', () => {
    const result = parseTournamentScheduleDocument(makeMinimalDocument({ breakTimeMinutes: null }));
    expect(result.breakTimeMinutes).toBeNull();
  });

  it('accepts matchDurationMinutes in 5-minute intervals (5–120)', () => {
    for (const dur of [5, 30, 60, 90, 120]) {
      expect(() => parseTournamentScheduleDocument(makeMinimalDocument({ matchDurationMinutes: dur }))).not.toThrow();
    }
  });

  it('accepts currentRound of 0', () => {
    expect(() => parseTournamentScheduleDocument(makeMinimalDocument({ currentRound: 0 }))).not.toThrow();
  });

  // ── validation failures ────────────────────────────────────────────────────

  it('throws when status is not in the allowed enum', () => {
    const data = makeMinimalDocument({ status: 'unknown' });
    expect(() => parseTournamentScheduleDocument(data)).toThrow('Invalid schedule document');
  });

  it('throws when matchDurationMinutes is not a 5-minute multiple', () => {
    expect(() => parseTournamentScheduleDocument(makeMinimalDocument({ matchDurationMinutes: 7 }))).toThrow('Invalid schedule document');
    expect(() => parseTournamentScheduleDocument(makeMinimalDocument({ matchDurationMinutes: 13 }))).toThrow('Invalid schedule document');
  });

  it('throws when matchDurationMinutes is out of range', () => {
    expect(() => parseTournamentScheduleDocument(makeMinimalDocument({ matchDurationMinutes: 0 }))).toThrow('Invalid schedule document');
    expect(() => parseTournamentScheduleDocument(makeMinimalDocument({ matchDurationMinutes: 125 }))).toThrow('Invalid schedule document');
  });

  it('throws when a round entry has a non-ObjectId game', () => {
    const data = makeMinimalDocument({
      rounds: [{ game: 'not-an-objectid', slot: 1, round: 1 }],
    });
    expect(() => parseTournamentScheduleDocument(data)).toThrow('Invalid schedule document');
  });

  it('throws when a round entry is missing slot', () => {
    const data = makeMinimalDocument({
      rounds: [{ game: makeId(), round: 1 }],
    });
    expect(() => parseTournamentScheduleDocument(data)).toThrow('Invalid schedule document');
  });

  it('throws when a round entry has slot < 1', () => {
    const data = makeMinimalDocument({
      rounds: [{ game: makeId(), slot: 0, round: 1 }],
    });
    expect(() => parseTournamentScheduleDocument(data)).toThrow('Invalid schedule document');
  });

  it('throws when a round entry has round < 1', () => {
    const data = makeMinimalDocument({
      rounds: [{ game: makeId(), slot: 1, round: 0 }],
    });
    expect(() => parseTournamentScheduleDocument(data)).toThrow('Invalid schedule document');
  });

  it('throws when the entire payload is null', () => {
    expect(() => parseTournamentScheduleDocument(null)).toThrow('Invalid schedule document');
  });

  it('throws when the entire payload is an empty object', () => {
    expect(() => parseTournamentScheduleDocument({})).toThrow('Invalid schedule document');
  });

  it('throws when _id is not an ObjectId', () => {
    const data = makeMinimalDocument({ _id: 'not-an-objectid' });
    expect(() => parseTournamentScheduleDocument(data)).toThrow('Invalid schedule document');
  });

  it('throws when matchesPerPlayer is out of valid range', () => {
    expect(() => parseTournamentScheduleDocument(makeMinimalDocument({ matchesPerPlayer: 0 }))).toThrow('Invalid schedule document');
    expect(() => parseTournamentScheduleDocument(makeMinimalDocument({ matchesPerPlayer: 21 }))).toThrow('Invalid schedule document');
  });
});
