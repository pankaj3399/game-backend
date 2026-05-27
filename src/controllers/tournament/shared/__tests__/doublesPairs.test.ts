import { Types } from 'mongoose';
import { sanitizeDoublesPairs, toDoublesPairsObject } from '../doublesPairs';

// ── sanitizeDoublesPairs ────────────────────────────────────────────────────

describe('sanitizeDoublesPairs()', () => {
  /** Generate `count` unique ObjectId strings. */
  function ids(count: number): string[] {
    return Array.from({ length: count }, () => new Types.ObjectId().toString());
  }

  it('returns an empty object when input is null', () => {
    const [a, b] = ids(2);
    expect(sanitizeDoublesPairs(null, [a, b])).toEqual({});
  });

  it('returns an empty object when input is an empty object', () => {
    const [a, b] = ids(2);
    expect(sanitizeDoublesPairs({}, [a, b])).toEqual({});
  });

  it('keeps a valid reciprocal pair', () => {
    const [a, b] = ids(2);
    const pairs = sanitizeDoublesPairs({ [a]: b, [b]: a }, [a, b]);
    expect(pairs[a]).toBe(b);
  });

  it('keeps both directions (symmetric output)', () => {
    const [a, b] = ids(2);
    const pairs = sanitizeDoublesPairs({ [a]: b, [b]: a }, [a, b]);
    expect(pairs[b]).toBe(a);
  });

  it('drops a non-reciprocal pair (A→B but B does not point back to A)', () => {
    const [a, b, c] = ids(3);
    // b points to c, not a → the a→b edge is not reciprocated
    const pairs = sanitizeDoublesPairs({ [a]: b, [b]: c }, [a, b, c]);
    expect(pairs[a]).toBeUndefined();
  });

  it('drops a self-pairing (A→A)', () => {
    const [a, b] = ids(2);
    const pairs = sanitizeDoublesPairs({ [a]: a, [b]: b }, [a, b]);
    expect(pairs[a]).toBeUndefined();
    expect(pairs[b]).toBeUndefined();
  });

  it('drops participants not in the valid participant list', () => {
    const [a, b] = ids(2);
    const outsider = new Types.ObjectId().toString();
    const pairs = sanitizeDoublesPairs({ [a]: outsider, [outsider]: a }, [a, b]);
    expect(pairs[a]).toBeUndefined();
  });

  it('handles a Map input by converting it first', () => {
    const [a, b] = ids(2);
    const map = new Map([[a, b], [b, a]]);
    const pairs = sanitizeDoublesPairs(map, [a, b]);
    expect(pairs[a]).toBe(b);
    expect(pairs[b]).toBe(a);
  });

  it('keeps multiple valid pairs in a 4-player set', () => {
    const [a, b, c, d] = ids(4);
    const raw = { [a]: b, [b]: a, [c]: d, [d]: c };
    const pairs = sanitizeDoublesPairs(raw, [a, b, c, d]);
    expect(pairs[a]).toBe(b);
    expect(pairs[b]).toBe(a);
    expect(pairs[c]).toBe(d);
    expect(pairs[d]).toBe(c);
  });

  it('drops participants whose partner value is not a string', () => {
    const [a, b] = ids(2);
    // partner of a is a number — invalid
    const pairs = sanitizeDoublesPairs({ [a]: 123 as any, [b]: a }, [a, b]);
    expect(pairs[a]).toBeUndefined();
  });

  it('does not double-enter a pair when both sides appear in the participant list', () => {
    // With the visited-set fix, iterating [a, b] should not overwrite b→a when
    // b is reached as the second element (it's already been visited as a's partner)
    const [a, b] = ids(2);
    const pairs = sanitizeDoublesPairs({ [a]: b, [b]: a }, [a, b]);
    expect(Object.keys(pairs)).toHaveLength(2);
    expect(pairs[a]).toBe(b);
    expect(pairs[b]).toBe(a);
  });
});

// ── toDoublesPairsObject ────────────────────────────────────────────────────

describe('toDoublesPairsObject()', () => {
  it('returns the object as-is when given a plain object', () => {
    const [a, b] = [new Types.ObjectId().toString(), new Types.ObjectId().toString()];
    const input = { [a]: b };
    expect(toDoublesPairsObject(input)).toStrictEqual(input);
  });

  it('converts a Map to a plain object', () => {
    const [a, b] = [new Types.ObjectId().toString(), new Types.ObjectId().toString()];
    const map = new Map([[a, b]]);
    expect(toDoublesPairsObject(map)).toStrictEqual({ [a]: b });
  });

  it('returns an empty object for null', () => {
    expect(toDoublesPairsObject(null)).toStrictEqual({});
  });

  it('returns an empty object for a non-object primitive', () => {
    expect(toDoublesPairsObject('string')).toStrictEqual({});
  });
});
