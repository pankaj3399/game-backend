import { parseDurationMinutes, resolveTimedGameStatus } from '../matchTiming';

// ---------- parseDurationMinutes ----------

describe('parseDurationMinutes()', () => {
  it('returns default (60) for null', () => {
    expect(parseDurationMinutes(null)).toBe(60);
  });

  it('returns default for undefined', () => {
    expect(parseDurationMinutes(undefined)).toBe(60);
  });

  it('returns default for empty string', () => {
    expect(parseDurationMinutes('')).toBe(60);
  });

  it('returns default when value is below 5', () => {
    expect(parseDurationMinutes(4)).toBe(60);
    expect(parseDurationMinutes('3')).toBe(60);
  });

  it('returns default when value is above 120', () => {
    expect(parseDurationMinutes(121)).toBe(60);
    expect(parseDurationMinutes('125')).toBe(60);
  });

  it('returns default when value is not a multiple of 5', () => {
    expect(parseDurationMinutes(23)).toBe(60);
    expect(parseDurationMinutes('47')).toBe(60);
  });

  it('accepts a valid numeric string like "60"', () => {
    expect(parseDurationMinutes('60')).toBe(60);
  });

  it('accepts a string with units like "90min"', () => {
    expect(parseDurationMinutes('90min')).toBe(90);
  });

  it('accepts boundary values 5 and 120', () => {
    expect(parseDurationMinutes(5)).toBe(5);
    expect(parseDurationMinutes(120)).toBe(120);
  });

  it('uses the custom fallback when value is invalid', () => {
    expect(parseDurationMinutes(null, 30)).toBe(30);
  });

  it('falls back to 60 if the custom fallback is also invalid', () => {
    // 7 is not a multiple of 5, so it normalizes to null → default 60
    expect(parseDurationMinutes(null, 7)).toBe(60);
  });
});

// ---------- resolveTimedGameStatus ----------

const BASE_DATE = new Date('2024-06-01T12:00:00Z');
const makeDate = (offsetMinutes: number) =>
  new Date(BASE_DATE.getTime() + offsetMinutes * 60_000);

describe('resolveTimedGameStatus()', () => {
  it.each(['finished', 'cancelled', 'pendingScore'] as const)(
    'returns persisted status "%s" immediately without further checks',
    (status) => {
      expect(
        resolveTimedGameStatus({
          persistedStatus: status,
          startTime: new Date(),
          matchDurationMinutes: 60,
          now: new Date(),
        })
      ).toBe(status);
    }
  );

  it('returns persisted status when startTime is missing', () => {
    expect(
      resolveTimedGameStatus({
        persistedStatus: 'draft',
        startTime: null,
        matchDurationMinutes: 60,
        now: BASE_DATE,
      })
    ).toBe('draft');
  });

  it('returns persisted status when durationMinutes is invalid (null)', () => {
    expect(
      resolveTimedGameStatus({
        persistedStatus: 'draft',
        startTime: BASE_DATE,
        matchDurationMinutes: null,
        now: makeDate(30),
      })
    ).toBe('draft');
  });

  it('returns "draft" when now is before startTime', () => {
    expect(
      resolveTimedGameStatus({
        persistedStatus: 'draft',
        startTime: makeDate(10), // starts 10 min from now
        matchDurationMinutes: 60,
        now: BASE_DATE,
      })
    ).toBe('draft');
  });

  it('returns "active" when now is within the match window', () => {
    expect(
      resolveTimedGameStatus({
        persistedStatus: 'draft',
        startTime: makeDate(-30), // started 30 min ago
        matchDurationMinutes: 60,
        now: BASE_DATE,
      })
    ).toBe('active');
  });

  it('returns "pendingScore" when match window has elapsed', () => {
    expect(
      resolveTimedGameStatus({
        persistedStatus: 'draft',
        startTime: makeDate(-70), // started 70 min ago, 60-min match
        matchDurationMinutes: 60,
        now: BASE_DATE,
      })
    ).toBe('pendingScore');
  });

  it('transitions to "pendingScore" exactly at end timestamp', () => {
    const startTime = makeDate(-60); // exactly 60 min ago
    expect(
      resolveTimedGameStatus({
        persistedStatus: 'active',
        startTime,
        matchDurationMinutes: 60,
        now: BASE_DATE,
      })
    ).toBe('pendingScore');
  });
});
