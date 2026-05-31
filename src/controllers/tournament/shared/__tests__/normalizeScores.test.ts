import { normalizeScores } from '../normalizeScores';

describe('normalizeScores()', () => {
  it('returns empty array for undefined input', () => {
    expect(normalizeScores(undefined)).toEqual([]);
  });

  it('returns empty array for an empty array', () => {
    expect(normalizeScores([])).toEqual([]);
  });

  it('passes through finite numbers unchanged', () => {
    expect(normalizeScores([0, 6, 10])).toEqual([0, 6, 10]);
  });

  it('passes through "wo" values', () => {
    expect(normalizeScores(['wo', 'wo'])).toEqual(['wo', 'wo']);
  });

  it('passes through null values', () => {
    expect(normalizeScores([null, null])).toEqual([null, null]);
  });

  it('handles a mixed array of numbers, "wo", and null', () => {
    expect(normalizeScores([6, null, 'wo', 3])).toEqual([6, null, 'wo', 3]);
  });

  it('silently drops NaN values (not finite)', () => {
    // NaN is a number but not finite — the function should skip it
    const result = normalizeScores([6, NaN, 4]);
    expect(result).toEqual([6, 4]);
  });

  it('silently drops Infinity values (not finite)', () => {
    const result = normalizeScores([Infinity, 6]);
    expect(result).toEqual([6]);
  });

  it('preserves order of values', () => {
    const input = [6, 3, null, 'wo'] as Array<number | 'wo' | null>;
    expect(normalizeScores(input)).toEqual([6, 3, null, 'wo']);
  });
});
