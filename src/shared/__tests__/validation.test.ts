import { z } from 'zod';
import {
  parseBodyWithSchema,
  parseQueryWithSchema,
  readRouteParam,
  parseRouteObjectId,
} from '../validation';
import { Types } from 'mongoose';

// ---------- readRouteParam ----------

describe('readRouteParam()', () => {
  it('returns the string directly when given a string', () => {
    expect(readRouteParam('abc')).toBe('abc');
  });

  it('returns the first element when given an array', () => {
    expect(readRouteParam(['first', 'second'])).toBe('first');
  });

  it('returns undefined when given undefined', () => {
    expect(readRouteParam(undefined)).toBeUndefined();
  });
});

// ---------- parseRouteObjectId ----------

describe('parseRouteObjectId()', () => {
  it('returns ok with the string when given a valid ObjectId', () => {
    const id = new Types.ObjectId().toString();
    const result = parseRouteObjectId(id, 'userId');
    expect(result.ok).toBe(true);
  });

  it('returns error 400 for an invalid ObjectId string', () => {
    const result = parseRouteObjectId('not-an-id', 'userId');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  it('returns error for undefined', () => {
    const result = parseRouteObjectId(undefined, 'userId');
    expect(result.ok).toBe(false);
  });

  it('picks the first element from an array param and validates it', () => {
    const id = new Types.ObjectId().toString();
    const result = parseRouteObjectId([id, 'ignored'], 'tournamentId');
    expect(result.ok).toBe(true);
  });
});

// ---------- parseBodyWithSchema ----------

const bodySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().int().min(0),
});

describe('parseBodyWithSchema()', () => {
  it('returns ok with parsed data on a valid payload', () => {
    const result = parseBodyWithSchema(bodySchema, { name: 'Alice', age: 30 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toStrictEqual({ name: 'Alice', age: 30 });
    }
  });

  it('returns error 400 when a required field is missing', () => {
    const result = parseBodyWithSchema(bodySchema, { age: 30 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Zod fires a type-mismatch issue (string expected, undefined received)
      // before any custom refinement message when the field is entirely absent.
      expect(result.status).toBe(400);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('joins multiple validation errors with "; "', () => {
    const result = parseBodyWithSchema(bodySchema, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Both 'name' and 'age' are missing → two issues
      expect(result.message).toContain(';');
    }
  });

  it('returns error when the entire payload is null', () => {
    const result = parseBodyWithSchema(bodySchema, null);
    expect(result.ok).toBe(false);
  });
});

// ---------- parseQueryWithSchema ----------

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

describe('parseQueryWithSchema()', () => {
  it('returns ok with coerced data on a valid query object', () => {
    const result = parseQueryWithSchema(querySchema, { page: '2', limit: '25' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(25);
    }
  });

  it('applies defaults when fields are omitted', () => {
    const result = parseQueryWithSchema(querySchema, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(10);
    }
  });

  it('returns error 400 when limit exceeds max', () => {
    const result = parseQueryWithSchema(querySchema, { limit: '999' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  it('returns error when page is less than 1', () => {
    const result = parseQueryWithSchema(querySchema, { page: '0' });
    expect(result.ok).toBe(false);
  });
});
