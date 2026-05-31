import { compareSetScore } from '../compareSetScore';
import { AppError } from '../../../../shared/errors';

// ---------------------------------------------------------------------------
// Standard set (1set / 3set / 5set / 3setTieBreak10 sets 0 & 1)
// ---------------------------------------------------------------------------

describe('compareSetScore() — standard set format', () => {
  const mode = '1set' as const;

  it('returns positive when player one wins 6-3', () => {
    expect(compareSetScore(6, 3, mode, 0)).toBeGreaterThan(0);
  });

  it('returns negative when player two wins 3-6', () => {
    expect(compareSetScore(3, 6, mode, 0)).toBeLessThan(0);
  });

  it('returns 0 for an in-progress score (4-4)', () => {
    expect(compareSetScore(4, 4, mode, 0)).toBe(0);
  });

  it('returns 0 for 6-5 (not yet decisive)', () => {
    expect(compareSetScore(6, 5, mode, 0)).toBe(0);
  });

  it('returns positive for 7-5 (player one wins tiebreak set)', () => {
    expect(compareSetScore(7, 5, mode, 0)).toBeGreaterThan(0);
  });

  it('returns positive for 7-6 (player one wins tiebreak)', () => {
    expect(compareSetScore(7, 6, mode, 0)).toBeGreaterThan(0);
  });

  it('returns negative for 6-7', () => {
    expect(compareSetScore(6, 7, mode, 0)).toBeLessThan(0);
  });

  it('throws AppError 400 when score exceeds 7', () => {
    expect(() => compareSetScore(8, 3, mode, 0)).toThrow(AppError);
    try {
      compareSetScore(8, 3, mode, 0);
    } catch (e) {
      expect((e as AppError).statusCode).toBe(400);
    }
  });

  it('throws AppError 400 for 7-4 (7-win requires opponent at 5 or 6)', () => {
    expect(() => compareSetScore(7, 4, mode, 0)).toThrow(AppError);
  });

  it('throws AppError 400 for 4-7', () => {
    expect(() => compareSetScore(4, 7, mode, 0)).toThrow(AppError);
  });

  it('returns 0 for null-null (no score yet)', () => {
    expect(compareSetScore(null, null, mode, 0)).toBe(0);
  });

  it('returns 0 for null vs number (partial entry)', () => {
    expect(compareSetScore(null, 6, mode, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TieBreak10 set format
// ---------------------------------------------------------------------------

describe('compareSetScore() — TieBreak10 format', () => {
  const mode = 'TieBreak10' as const;

  it('returns positive when player one wins 10-5', () => {
    expect(compareSetScore(10, 5, mode, 0)).toBeGreaterThan(0);
  });

  it('returns negative when player two wins 5-10', () => {
    expect(compareSetScore(5, 10, mode, 0)).toBeLessThan(0);
  });

  it('returns positive for 11-9 (extra point, diff = 2)', () => {
    expect(compareSetScore(11, 9, mode, 0)).toBeGreaterThan(0);
  });

  it('returns negative for 9-11', () => {
    expect(compareSetScore(9, 11, mode, 0)).toBeLessThan(0);
  });

  it('returns 0 for 10-9 (not yet decisive, diff < 2)', () => {
    expect(compareSetScore(10, 9, mode, 0)).toBe(0);
  });

  it('returns 0 for 9-9 (tied at high score)', () => {
    expect(compareSetScore(9, 9, mode, 0)).toBe(0);
  });

  it('throws AppError 400 for 12-8 (diff > 2 past 10)', () => {
    expect(() => compareSetScore(12, 8, mode, 0)).toThrow(AppError);
  });
});

// ---------------------------------------------------------------------------
// 3setTieBreak10 — third set uses TieBreak10, others use standard
// ---------------------------------------------------------------------------

describe('compareSetScore() — 3setTieBreak10 format', () => {
  const mode = '3setTieBreak10' as const;

  it('set index 0 uses standard rules (6-3 decisive)', () => {
    expect(compareSetScore(6, 3, mode, 0)).toBeGreaterThan(0);
  });

  it('set index 2 uses TieBreak10 rules (10-5 decisive)', () => {
    expect(compareSetScore(10, 5, mode, 2)).toBeGreaterThan(0);
  });

  it('set index 2 returns 0 for 6-3 (standard 6-game score is not decisive in TieBreak10)', () => {
    // 6-3 in tiebreak10: neither reached 10 with diff >= 2
    expect(compareSetScore(6, 3, mode, 2)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Walkover ("wo") rules — apply across all formats
// ---------------------------------------------------------------------------

describe('compareSetScore() — walkover handling', () => {
  it('returns -1 when player one has walkover (forfeited)', () => {
    expect(compareSetScore('wo', 6, '1set', 0)).toBe(-1);
  });

  it('returns +1 when player two has walkover', () => {
    expect(compareSetScore(6, 'wo', '1set', 0)).toBe(1);
  });

  it('returns 0 when both have walkover (mutual forfeit)', () => {
    expect(compareSetScore('wo', 'wo', '1set', 0)).toBe(0);
  });
});
