import { TournamentTimezoneResolutionError } from '../resolveTournamentTimezone';

// ─────────────────────────────────────────────────────────────────────────────
// TournamentTimezoneResolutionError — pure class, no DB
// ─────────────────────────────────────────────────────────────────────────────

describe('TournamentTimezoneResolutionError', () => {
  it('creates an error with code MISSING_COORDINATES', () => {
    const err = new TournamentTimezoneResolutionError(
      'MISSING_COORDINATES',
      'Club has no coordinates'
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TournamentTimezoneResolutionError);
    expect(err.code).toBe('MISSING_COORDINATES');
    expect(err.message).toBe('Club has no coordinates');
    expect(err.name).toBe('TournamentTimezoneResolutionError');
  });

  it('creates an error with code INVALID_COORDINATES', () => {
    const err = new TournamentTimezoneResolutionError(
      'INVALID_COORDINATES',
      'Coordinates are out of range'
    );
    expect(err.code).toBe('INVALID_COORDINATES');
    expect(err.message).toBe('Coordinates are out of range');
    expect(err.name).toBe('TournamentTimezoneResolutionError');
  });

  it('is instanceof Error (catchable as generic Error)', () => {
    const err = new TournamentTimezoneResolutionError('MISSING_COORDINATES', 'test');
    const caught = (() => {
      try {
        throw err;
      } catch (e) {
        return e;
      }
    })();
    expect(caught).toBeInstanceOf(Error);
    expect((caught as TournamentTimezoneResolutionError).code).toBe('MISSING_COORDINATES');
  });

  it('preserves the correct error name for discriminating in catch blocks', () => {
    const err = new TournamentTimezoneResolutionError('INVALID_COORDINATES', 'bad coords');
    expect(err.name).toBe('TournamentTimezoneResolutionError');
  });

  it('sets the stack trace (behaves like a standard Error)', () => {
    const err = new TournamentTimezoneResolutionError('MISSING_COORDINATES', 'test');
    expect(typeof err.stack).toBe('string');
    expect(err.stack).toContain('TournamentTimezoneResolutionError');
  });
});
