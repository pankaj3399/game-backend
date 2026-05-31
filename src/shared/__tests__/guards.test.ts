import { guardObjectId, guardIdParam, guardEntityFound } from '../guards';
import { Types } from 'mongoose';

describe('guardObjectId()', () => {
  it('returns ok with the string when given a valid ObjectId', () => {
    const id = new Types.ObjectId().toString();
    const result = guardObjectId(id, 'userId');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(id);
    }
  });

  it('returns error 400 for an invalid ObjectId string', () => {
    const result = guardObjectId('not-a-valid-id', 'userId');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toContain('userId');
    }
  });

  it('returns error 400 for undefined', () => {
    const result = guardObjectId(undefined, 'tournamentId');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  it('uses the default field name "ID" when none provided', () => {
    const result = guardObjectId('bad');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('ID');
    }
  });
});

describe('guardIdParam()', () => {
  it('returns ok with the id string when params.id is a valid ObjectId', () => {
    const id = new Types.ObjectId().toString();
    const result = guardIdParam({ id }, 'clubId');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe(id);
    }
  });

  it('returns error 400 when params.id is undefined', () => {
    const result = guardIdParam({}, 'clubId');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  it('returns error 400 when params.id is an invalid ObjectId string', () => {
    const result = guardIdParam({ id: 'bad' }, 'clubId');
    expect(result.ok).toBe(false);
  });
});

describe('guardEntityFound()', () => {
  it('returns true for a non-null, non-undefined value', () => {
    expect(guardEntityFound({ id: 1 })).toBe(true);
  });

  it('returns true for an empty object', () => {
    expect(guardEntityFound({})).toBe(true);
  });

  it('returns false for null', () => {
    expect(guardEntityFound(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(guardEntityFound(undefined)).toBe(false);
  });

  it('returns true for 0 (falsy but not null/undefined)', () => {
    expect(guardEntityFound(0)).toBe(true);
  });

  it('returns true for empty string (falsy but not null/undefined)', () => {
    expect(guardEntityFound('')).toBe(true);
  });
});
