import { computeSpotsTotal } from '../computeSpotsTotal';

describe('computeSpotsTotal', () => {
  it('returns Infinity when maxMember is undefined', () => {
    expect(computeSpotsTotal(undefined)).toBe(Infinity);
  });

  it('returns Infinity when maxMember is NaN', () => {
    expect(computeSpotsTotal(NaN)).toBe(Infinity);
  });

  it('returns Infinity when maxMember is Infinity itself', () => {
    expect(computeSpotsTotal(Infinity)).toBe(Infinity);
  });

  it('returns Infinity when maxMember is -Infinity', () => {
    expect(computeSpotsTotal(-Infinity)).toBe(Infinity);
  });

  it('returns Infinity when maxMember is negative', () => {
    expect(computeSpotsTotal(-1)).toBe(Infinity);
    expect(computeSpotsTotal(-100)).toBe(Infinity);
  });

  it('returns 0 when maxMember is 0', () => {
    // returns 0 as-is
    expect(computeSpotsTotal(0)).toBe(0);
  });

  it('returns the exact value when maxMember is a positive integer', () => {
    expect(computeSpotsTotal(10)).toBe(10);
    expect(computeSpotsTotal(1)).toBe(1);
  });

  it('truncates decimals toward zero', () => {
    expect(computeSpotsTotal(10.9)).toBe(10);
    expect(computeSpotsTotal(5.1)).toBe(5);
  });
});
