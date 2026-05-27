import { Types } from 'mongoose';
import type { ScheduleParticipantInfo, TournamentScheduleContext } from '../types';
import {
  participantDisplayName,
  getParticipantOrder,
  resolveParticipantsForScheduleGeneration,
  sortParticipantsForScheduling,
  buildDoublesPairs,
  computeMatchStartTime,
  getDefaultScheduleInput,
} from '../helpers';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeId() {
  return new Types.ObjectId();
}

function makeParticipant(
  rating = 1500,
  overrides: Partial<ScheduleParticipantInfo> = {}
): ScheduleParticipantInfo {
  return {
    _id: makeId(),
    name: 'Player',
    alias: null,
    profilePictureUrl: null,
    elo: { rating, rd: 200 },
    ...overrides,
  };
}

function makeTournamentContext(
  overrides: Partial<TournamentScheduleContext> = {}
): TournamentScheduleContext {
  return {
    tournamentMode: 'singleDay',
    startTime: '09:00',
    endTime: '17:00',
    duration: 45,
    breakDuration: 15,
    club: {
      courts: [
        { _id: makeId(), name: 'Court 1' },
        { _id: makeId(), name: 'Court 2' },
        { _id: makeId(), name: 'Court 3' },
      ],
    },
    ...overrides,
  } as unknown as TournamentScheduleContext;
}

// ── participantDisplayName ────────────────────────────────────────────────────

describe('participantDisplayName()', () => {
  it('returns alias when alias is set', () => {
    expect(participantDisplayName({ alias: '  Ace  ', name: 'Alice' }, 'fallback')).toBe('Ace');
  });

  it('returns name when alias is empty/null', () => {
    expect(participantDisplayName({ alias: null, name: 'Bob' }, 'fallback')).toBe('Bob');
    expect(participantDisplayName({ alias: '   ', name: 'Bob' }, 'fallback')).toBe('Bob');
  });

  it('returns fallback when both alias and name are empty', () => {
    expect(participantDisplayName({ alias: null, name: null }, 'fallback')).toBe('fallback');
    expect(participantDisplayName({ alias: '  ', name: '  ' }, 'fallback')).toBe('fallback');
  });

  it('trims whitespace from values', () => {
    expect(participantDisplayName({ alias: '  Ace  ', name: null }, 'fallback')).toBe('Ace');
  });
});

// ── getParticipantOrder ───────────────────────────────────────────────────────

describe('getParticipantOrder()', () => {
  it('returns participants in the order specified by the order array', () => {
    const p1 = makeParticipant(1500);
    const p2 = makeParticipant(1600);
    const p3 = makeParticipant(1700);

    const ordered = getParticipantOrder(
      [p2._id.toString(), p3._id.toString(), p1._id.toString()],
      [p1, p2, p3]
    );

    expect(ordered[0]._id.toString()).toBe(p2._id.toString());
    expect(ordered[1]._id.toString()).toBe(p3._id.toString());
    expect(ordered[2]._id.toString()).toBe(p1._id.toString());
  });

  it('appends participants not in the order list at the end', () => {
    const p1 = makeParticipant();
    const p2 = makeParticipant();

    const ordered = getParticipantOrder([p1._id.toString()], [p1, p2]);
    expect(ordered[0]._id.toString()).toBe(p1._id.toString());
    expect(ordered[1]._id.toString()).toBe(p2._id.toString());
  });

  it('skips duplicate ids in the order list', () => {
    const p1 = makeParticipant();
    const ordered = getParticipantOrder(
      [p1._id.toString(), p1._id.toString()],
      [p1]
    );
    expect(ordered).toHaveLength(1);
  });

  it('skips ids in order list that do not correspond to any participant', () => {
    const p1 = makeParticipant();
    const ghostId = makeId().toString();
    const ordered = getParticipantOrder([ghostId, p1._id.toString()], [p1]);
    expect(ordered).toHaveLength(1);
    expect(ordered[0]._id.toString()).toBe(p1._id.toString());
  });
});

// ── resolveParticipantsForScheduleGeneration ─────────────────────────────────

describe('resolveParticipantsForScheduleGeneration()', () => {
  it('includes only participants whose IDs appear in the order list', () => {
    const p1 = makeParticipant();
    const p2 = makeParticipant();
    const p3 = makeParticipant();

    const resolved = resolveParticipantsForScheduleGeneration(
      [p1._id.toString(), p3._id.toString()],
      [p1, p2, p3]
    );

    expect(resolved).toHaveLength(2);
    const ids = resolved.map((p) => p._id.toString());
    expect(ids).toContain(p1._id.toString());
    expect(ids).toContain(p3._id.toString());
    expect(ids).not.toContain(p2._id.toString());
  });

  it('preserves the order from the participantOrder array', () => {
    const p1 = makeParticipant();
    const p2 = makeParticipant();

    const resolved = resolveParticipantsForScheduleGeneration(
      [p2._id.toString(), p1._id.toString()],
      [p1, p2]
    );

    expect(resolved[0]._id.toString()).toBe(p2._id.toString());
    expect(resolved[1]._id.toString()).toBe(p1._id.toString());
  });

  it('returns empty array when order list is empty', () => {
    const p1 = makeParticipant();
    const resolved = resolveParticipantsForScheduleGeneration([], [p1]);
    expect(resolved).toHaveLength(0);
  });
});

// ── sortParticipantsForScheduling ─────────────────────────────────────────────

describe('sortParticipantsForScheduling()', () => {
  it('sorts by rating descending', () => {
    const p1 = makeParticipant(1200);
    const p2 = makeParticipant(1800);
    const p3 = makeParticipant(1500);

    const sorted = sortParticipantsForScheduling([p1, p2, p3]);

    expect(sorted[0].elo.rating).toBe(1800);
    expect(sorted[1].elo.rating).toBe(1500);
    expect(sorted[2].elo.rating).toBe(1200);
  });

  it('sorts by display name (alias > name) as tiebreaker when ratings are equal', () => {
    const pA = makeParticipant(1500, { alias: 'Zara', name: null });
    const pB = makeParticipant(1500, { alias: null, name: 'Alice' });

    const sorted = sortParticipantsForScheduling([pA, pB]);
    // Alice < Zara alphabetically, so Alice should come first
    const [first, second] = sorted;
    const firstName = participantDisplayName(first, '').toLowerCase();
    const secondName = participantDisplayName(second, '').toLowerCase();
    expect(firstName <= secondName).toBe(true);
  });

  it('does not mutate the original array', () => {
    const participants = [makeParticipant(1200), makeParticipant(1800)];
    const original0Id = participants[0]._id.toString();
    sortParticipantsForScheduling(participants);
    expect(participants[0]._id.toString()).toBe(original0Id);
  });
});

// ── buildDoublesPairs ────────────────────────────────────────────────────────

describe('buildDoublesPairs()', () => {
  it('pairs consecutive participants into teams of 2', () => {
    const participants = [
      makeParticipant(1800),
      makeParticipant(1700),
      makeParticipant(1600),
      makeParticipant(1500),
    ];

    const { teams, unpaired } = buildDoublesPairs(participants);

    expect(teams).toHaveLength(2);
    expect(unpaired).toHaveLength(0);
    expect(teams[0].players).toHaveLength(2);
    expect(teams[1].players).toHaveLength(2);
  });

  it('returns the odd participant in unpaired when count is odd', () => {
    const participants = [makeParticipant(), makeParticipant(), makeParticipant()];
    const { teams, unpaired } = buildDoublesPairs(participants);
    expect(teams).toHaveLength(1);
    expect(unpaired).toHaveLength(1);
  });

  it('teams are numbered sequentially from 1', () => {
    const participants = [makeParticipant(), makeParticipant(), makeParticipant(), makeParticipant()];
    const { teams } = buildDoublesPairs(participants);
    expect(teams[0].team).toBe(1);
    expect(teams[1].team).toBe(2);
  });

  it('returns empty arrays for empty input', () => {
    const { teams, unpaired } = buildDoublesPairs([]);
    expect(teams).toHaveLength(0);
    expect(unpaired).toHaveLength(0);
  });
});

// ── computeMatchStartTime ────────────────────────────────────────────────────

describe('computeMatchStartTime()', () => {
  const tz = 'UTC';
  const baseDate = new Date('2025-06-01T00:00:00Z');

  it('returns a Date for slot 1 that equals the start time on the base date', () => {
    const result = computeMatchStartTime(
      baseDate,
      '09:00',
      1,
      { matchDurationMinutes: 45, breakTimeMinutes: 15 },
      { tournamentTimezone: tz }
    );
    expect(result).toBeInstanceOf(Date);
    expect(result.getUTCHours()).toBe(9);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it('offsets slot 2 by one time block from slot 1', () => {
    const opts = { matchDurationMinutes: 45, breakTimeMinutes: 15 };
    const slot1 = computeMatchStartTime(baseDate, '09:00', 1, opts, { tournamentTimezone: tz });
    const slot2 = computeMatchStartTime(baseDate, '09:00', 2, opts, { tournamentTimezone: tz });
    // timeBlock = 45 + 15 = 60 minutes
    const diffMinutes = (slot2.getTime() - slot1.getTime()) / 60000;
    expect(diffMinutes).toBe(60);
  });

  it('throws for invalid startTime format', () => {
    expect(() =>
      computeMatchStartTime(baseDate, 'invalid', 1, { matchDurationMinutes: 45, breakTimeMinutes: 15 }, { tournamentTimezone: tz })
    ).toThrow('Invalid startTime format');
  });

  it('throws for missing timezone', () => {
    expect(() =>
      computeMatchStartTime(baseDate, '09:00', 1, { matchDurationMinutes: 45, breakTimeMinutes: 15 }, { tournamentTimezone: '' })
    ).toThrow('Tournament timezone is missing or invalid');
  });

  it('throws when windowEndTime is before startTime', () => {
    expect(() =>
      computeMatchStartTime(
        baseDate,
        '09:00',
        1,
        { matchDurationMinutes: 45, breakTimeMinutes: 15 },
        { tournamentTimezone: tz, windowEndTime: '08:00' }
      )
    ).toThrow('Invalid schedule window endTime');
  });

  it('throws when schedule window is shorter than match duration', () => {
    expect(() =>
      computeMatchStartTime(
        baseDate,
        '09:00',
        1,
        { matchDurationMinutes: 120, breakTimeMinutes: 0 },
        { tournamentTimezone: tz, windowEndTime: '09:30' }
      )
    ).toThrow('Configured schedule window is shorter than a single match duration');
  });

  it('wraps to the next day when slots exceed the window', () => {
    // Window: 09:00 – 10:00 (60 min), matchDuration=45, break=15 → 1 match per day
    // Slot 2 should start the next day
    const result = computeMatchStartTime(
      baseDate,
      '09:00',
      2,
      { matchDurationMinutes: 45, breakTimeMinutes: 15 },
      { tournamentTimezone: tz, windowEndTime: '10:00' }
    );
    // Slot 2 on day 2 = June 2 at 09:00
    expect(result.getUTCDate()).toBe(2);
    expect(result.getUTCHours()).toBe(9);
  });

  it('uses current date when baseDate is null', () => {
    const result = computeMatchStartTime(
      null,
      '09:00',
      1,
      { matchDurationMinutes: 45, breakTimeMinutes: 15 },
      { tournamentTimezone: tz }
    );
    expect(result).toBeInstanceOf(Date);
    expect(result.getUTCHours()).toBe(9);
  });
});

// ── getDefaultScheduleInput ───────────────────────────────────────────────────

describe('getDefaultScheduleInput()', () => {
  it('includes all courts in availableCourts', () => {
    const context = makeTournamentContext();
    const result = getDefaultScheduleInput(context);
    expect(result.availableCourts).toHaveLength(3);
  });

  it('pre-selects up to 2 courts by default', () => {
    const context = makeTournamentContext();
    const result = getDefaultScheduleInput(context);
    const selectedCount = result.availableCourts.filter((c) => c.selected).length;
    expect(selectedCount).toBe(2);
  });

  it('includes matchDurationMinutes and breakTimeMinutes for singleDay mode', () => {
    const context = makeTournamentContext({ tournamentMode: 'singleDay' });
    const result = getDefaultScheduleInput(context);
    expect(result).toHaveProperty('matchDurationMinutes');
    expect(result).toHaveProperty('breakTimeMinutes');
  });

  it('does NOT include matchDurationMinutes for non-singleDay modes', () => {
    const context = makeTournamentContext({ tournamentMode: 'league' as never });
    const result = getDefaultScheduleInput(context);
    expect(result).not.toHaveProperty('matchDurationMinutes');
  });

  it('respects custom matchesPerPlayer option', () => {
    const context = makeTournamentContext();
    const result = getDefaultScheduleInput(context, { matchesPerPlayer: 3 });
    expect(result.matchesPerPlayer).toBe(3);
  });

  it('returns empty availableCourts when club has no courts', () => {
    const context = makeTournamentContext({ club: { courts: [] } as unknown as TournamentScheduleContext['club'] });
    const result = getDefaultScheduleInput(context);
    expect(result.availableCourts).toHaveLength(0);
  });
});
