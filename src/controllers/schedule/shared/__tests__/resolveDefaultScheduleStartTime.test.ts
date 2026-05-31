import { resolveDefaultScheduleStartTime, type ScheduleGameTiming } from '../resolveDefaultScheduleStartTime';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeGame(round: number, startOffsetMs: number, durationMs: number): ScheduleGameTiming {
  const now = new Date('2025-06-01T09:00:00Z');
  const startTime = new Date(now.getTime() + startOffsetMs);
  const endTime = new Date(startTime.getTime() + durationMs);
  return { round, startTime, endTime };
}

// ── resolveDefaultScheduleStartTime ──────────────────────────────────────────

describe('resolveDefaultScheduleStartTime()', () => {
  const tz = 'UTC';
  const baseNow = new Date('2025-06-01T14:00:00Z'); // 14:00 UTC

  it('returns tournament start time for round 1 when no games exist', () => {
    const result = resolveDefaultScheduleStartTime({
      targetRound: 1,
      tournamentStartTime: '09:00',
      matchDurationMinutes: 45,
      games: [],
      timeZone: tz,
      now: baseNow,
    });
    expect(result).toBe('09:00');
  });

  it('uses DEFAULT_SCHEDULE_START_TIME when tournamentStartTime is null', () => {
    const result = resolveDefaultScheduleStartTime({
      targetRound: 1,
      tournamentStartTime: null,
      matchDurationMinutes: 45,
      games: [],
      timeZone: tz,
      now: baseNow,
    });
    // Should return some valid HH:MM string
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('returns tournament start time for round 1 even when prior games exist', () => {
    const games: ScheduleGameTiming[] = [makeGame(1, 0, 45 * 60000)];
    const result = resolveDefaultScheduleStartTime({
      targetRound: 1,
      tournamentStartTime: '09:00',
      matchDurationMinutes: 45,
      games,
      timeZone: tz,
    });
    expect(result).toBe('09:00');
  });

  it('for round > 1, returns a time based on the latest game end of previous rounds', () => {
    const games: ScheduleGameTiming[] = [makeGame(1, 0, 60 * 60000)];

    const result = resolveDefaultScheduleStartTime({
      targetRound: 2,
      tournamentStartTime: '09:00',
      matchDurationMinutes: 60,
      games,
      timeZone: tz,
      now: new Date('2025-06-01T08:00:00Z'), // before any game starts
    });

    // The latest round 1 end time is 10:00 UTC → returns '10:00'
    expect(result).toBe('10:00');
  });

  it('ignores games from the target round itself when calculating previous rounds', () => {
    const games: ScheduleGameTiming[] = [
      makeGame(2, 2 * 60 * 60000, 60 * 60000),
      makeGame(1, 0, 60 * 60000),
    ];

    const result = resolveDefaultScheduleStartTime({
      targetRound: 2,
      tournamentStartTime: '09:00',
      matchDurationMinutes: 60,
      games,
      timeZone: tz,
      now: new Date('2025-06-01T08:00:00Z'),
    });

    // Only round 1 should contribute → 10:00
    expect(result).toBe('10:00');
  });

  it('skips games with detachedFromRound set', () => {
    const games: ScheduleGameTiming[] = [
      { ...makeGame(1, -2 * 60 * 60000, 60 * 60000), detachedFromRound: 1 },
      makeGame(1, 0, 60 * 60000),
    ];

    const result = resolveDefaultScheduleStartTime({
      targetRound: 2,
      tournamentStartTime: '09:00',
      matchDurationMinutes: 60,
      games,
      timeZone: tz,
      now: new Date('2025-06-01T08:00:00Z'),
    });

    // Detached game (07:00-08:00) is skipped; only non-detached (09:00-10:00) counts → 10:00
    expect(result).toBe('10:00');
  });

  it('uses now when latest game end is in the past relative to now', () => {
    const games: ScheduleGameTiming[] = [makeGame(1, 0, 60 * 60000)];

    // now is 14:00 — later than the game end
    const result = resolveDefaultScheduleStartTime({
      targetRound: 2,
      tournamentStartTime: '09:00',
      matchDurationMinutes: 60,
      games,
      timeZone: tz,
      now: baseNow, // 14:00
    });

    // anchorMs = max(10:00, 14:00) = 14:00
    expect(result).toBe('14:00');
  });

  it('picks the latest end time when multiple round-1 games exist', () => {
    const games: ScheduleGameTiming[] = [
      makeGame(1, 0, 60 * 60000),
      makeGame(1, 30 * 60000, 90 * 60000),
    ];

    const result = resolveDefaultScheduleStartTime({
      targetRound: 2,
      tournamentStartTime: '09:00',
      matchDurationMinutes: 60,
      games,
      timeZone: tz,
      now: new Date('2025-06-01T08:00:00Z'),
    });

    // Latest end is 11:00
    expect(result).toBe('11:00');
  });

  it('derives end time from startTime + matchDurationMinutes when endTime is missing', () => {
    const games: ScheduleGameTiming[] = [
      {
        round: 1,
        startTime: new Date('2025-06-01T09:00:00Z'),
        // endTime not set
      },
    ];

    const result = resolveDefaultScheduleStartTime({
      targetRound: 2,
      tournamentStartTime: '09:00',
      matchDurationMinutes: 60,
      games,
      timeZone: tz,
      now: new Date('2025-06-01T08:00:00Z'),
    });

    // 09:00 + 60 min = 10:00
    expect(result).toBe('10:00');
  });

  it('returns valid HH:MM format for all cases', () => {
    const result = resolveDefaultScheduleStartTime({
      targetRound: 1,
      tournamentStartTime: '9:5', // single digit hour/minute
      matchDurationMinutes: 45,
      games: [],
      timeZone: tz,
      now: baseNow,
    });
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('ignores games with null startTime', () => {
    const games: ScheduleGameTiming[] = [
      { round: 1, startTime: null },
    ];

    const result = resolveDefaultScheduleStartTime({
      targetRound: 2,
      tournamentStartTime: '09:00',
      matchDurationMinutes: 60,
      games,
      timeZone: tz,
      now: new Date('2025-06-01T11:00:00Z'),
    });

    // startTime is null → endMs is null → skip → use now (11:00)
    expect(result).toBe('11:00');
  });
});
