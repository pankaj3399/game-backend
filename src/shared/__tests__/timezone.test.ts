import {
  isValidIanaTimeZone,
  resolveTournamentTimeZone,
  zonedDateTimeToUtcDate,
  getStartOfTodayInTimeZoneUtc,
  DEFAULT_TOURNAMENT_TIMEZONE,
} from '../timezone';

describe('isValidIanaTimeZone()', () => {
  it('returns true for "UTC"', () => {
    expect(isValidIanaTimeZone('UTC')).toBe(true);
  });

  it('returns true for "America/New_York"', () => {
    expect(isValidIanaTimeZone('America/New_York')).toBe(true);
  });

  it('returns true for "Asia/Kolkata"', () => {
    expect(isValidIanaTimeZone('Asia/Kolkata')).toBe(true);
  });

  it('returns true for "Europe/London"', () => {
    expect(isValidIanaTimeZone('Europe/London')).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidIanaTimeZone(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidIanaTimeZone(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidIanaTimeZone('')).toBe(false);
  });

  it('returns false for a raw UTC offset like "+05:30"', () => {
    expect(isValidIanaTimeZone('+05:30')).toBe(false);
  });

  it('returns false for "UTC+05:30"', () => {
    expect(isValidIanaTimeZone('UTC+05:30')).toBe(false);
  });

  it('returns false for a completely invalid string', () => {
    expect(isValidIanaTimeZone('NotATimezone')).toBe(false);
  });
});

describe('resolveTournamentTimeZone()', () => {
  it('returns the value when it is a valid IANA timezone', () => {
    expect(resolveTournamentTimeZone('Asia/Tokyo')).toBe('Asia/Tokyo');
  });

  it('returns the fallback when value is invalid', () => {
    expect(resolveTournamentTimeZone('bad/zone', 'Europe/Paris')).toBe('Europe/Paris');
  });

  it('returns DEFAULT_TOURNAMENT_TIMEZONE when both value and fallback are invalid', () => {
    expect(resolveTournamentTimeZone('bad', 'also-bad')).toBe(DEFAULT_TOURNAMENT_TIMEZONE);
  });

  it('returns DEFAULT_TOURNAMENT_TIMEZONE when value is null and no fallback provided', () => {
    expect(resolveTournamentTimeZone(null)).toBe(DEFAULT_TOURNAMENT_TIMEZONE);
  });
});

describe('zonedDateTimeToUtcDate()', () => {
  it('round-trips correctly in UTC (no offset)', () => {
    const input = { year: 2024, month: 6, day: 15, hour: 10, minute: 30, second: 0 };
    const result = zonedDateTimeToUtcDate(input, 'UTC');
    expect(result.toISOString()).toBe('2024-06-15T10:30:00.000Z');
  });

  it('converts Asia/Kolkata (+05:30) correctly', () => {
    // 12:00 IST = 06:30 UTC
    const input = { year: 2024, month: 1, day: 1, hour: 12, minute: 0, second: 0 };
    const result = zonedDateTimeToUtcDate(input, 'Asia/Kolkata');
    expect(result.toISOString()).toBe('2024-01-01T06:30:00.000Z');
  });

  it('converts America/New_York (EST, -05:00) correctly', () => {
    // 09:00 EST = 14:00 UTC (January, no DST)
    const input = { year: 2024, month: 1, day: 15, hour: 9, minute: 0, second: 0 };
    const result = zonedDateTimeToUtcDate(input, 'America/New_York');
    expect(result.toISOString()).toBe('2024-01-15T14:00:00.000Z');
  });

  it('defaults second to 0 when not provided', () => {
    const input = { year: 2024, month: 3, day: 1, hour: 0, minute: 0 };
    const result = zonedDateTimeToUtcDate(input, 'UTC');
    expect(result.getSeconds()).toBe(0);
  });
});

describe('getStartOfTodayInTimeZoneUtc()', () => {
  it('returns midnight of the current day in the given timezone, as UTC', () => {
    // Use a fixed instant and UTC so the conversion is deterministic
    const now = new Date('2024-07-04T15:00:00Z');
    const result = getStartOfTodayInTimeZoneUtc('UTC', now);
    expect(result.toISOString()).toBe('2024-07-04T00:00:00.000Z');
  });

  it('returns the previous day in UTC when the timezone is ahead', () => {
    // 2024-07-04T01:00:00Z = 2024-07-04T06:30+05:30 IST — so today in IST is July 4
    const now = new Date('2024-07-04T01:00:00Z');
    const result = getStartOfTodayInTimeZoneUtc('Asia/Kolkata', now);
    // Midnight IST July 4 = 2024-07-03T18:30:00Z
    expect(result.toISOString()).toBe('2024-07-03T18:30:00.000Z');
  });
});
