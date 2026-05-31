import {
  requiredSetCount,
  normalizeIndependentMatchType,
  normalizeIndependentPlayMode,
  resolveWinnerBySets,
  normalizeMatchStatus,
} from '../scoreHelpers';
import type { RecordMatchScoreInput } from '../../recordMatchScore/validation';

// ── helpers ────────────────────────────────────────────────────────────────

function makeInput(
  ones: Array<number | 'wo' | null>,
  twos: Array<number | 'wo' | null>,
): RecordMatchScoreInput {
  return { playerOneScores: ones, playerTwoScores: twos } as RecordMatchScoreInput;
}

// ── requiredSetCount ────────────────────────────────────────────────────────

describe('requiredSetCount()', () => {
  it('returns 5 for 5set', () => expect(requiredSetCount('5set')).toBe(5));
  it('returns 3 for 3set', () => expect(requiredSetCount('3set')).toBe(3));
  it('returns 3 for 3setTieBreak10', () => expect(requiredSetCount('3setTieBreak10')).toBe(3));
  it('returns 1 for 1set', () => expect(requiredSetCount('1set')).toBe(1));
  it('returns 1 for TieBreak10', () => expect(requiredSetCount('TieBreak10')).toBe(1));
});

// ── normalizeIndependentMatchType ──────────────────────────────────────────

describe('normalizeIndependentMatchType()', () => {
  it('returns "doubles" when matchType is "doubles"', () => {
    expect(normalizeIndependentMatchType('doubles')).toBe('doubles');
  });

  it('returns "singles" for undefined', () => {
    expect(normalizeIndependentMatchType(undefined)).toBe('singles');
  });

  it('returns "singles" for "singles"', () => {
    expect(normalizeIndependentMatchType('singles')).toBe('singles');
  });
});

// ── normalizeIndependentPlayMode ───────────────────────────────────────────

describe('normalizeIndependentPlayMode()', () => {
  it('returns explicit play mode when one of the 5 valid modes is provided', () => {
    for (const mode of ['TieBreak10', '1set', '3setTieBreak10', '3set', '5set'] as const) {
      expect(normalizeIndependentPlayMode(makeInput([], []), mode)).toBe(mode);
    }
  });

  it('infers "5set" when 5 or more sets are provided', () => {
    const input = makeInput([6, 6, 6, 6, 6], [3, 3, 3, 3, 3]);
    expect(normalizeIndependentPlayMode(input)).toBe('5set');
  });

  it('infers "3set" when 3 sets are provided', () => {
    const input = makeInput([6, 6, 6], [3, 3, 3]);
    expect(normalizeIndependentPlayMode(input)).toBe('3set');
  });

  it('infers "3set" when exactly 2 sets are provided', () => {
    const input = makeInput([6, 6], [3, 3]);
    expect(normalizeIndependentPlayMode(input)).toBe('3set');
  });

  it('infers "TieBreak10" from a single set that looks like a super tiebreak (10-5)', () => {
    const input = makeInput([10], [5]);
    expect(normalizeIndependentPlayMode(input)).toBe('TieBreak10');
  });

  it('infers "1set" from a single standard set score (6-3)', () => {
    const input = makeInput([6], [3]);
    expect(normalizeIndependentPlayMode(input)).toBe('1set');
  });

  it('infers "TieBreak10" when no sets are provided (empty arrays)', () => {
    const input = makeInput([], []);
    expect(normalizeIndependentPlayMode(input)).toBe('TieBreak10');
  });
});

// ── resolveWinnerBySets ────────────────────────────────────────────────────

describe('resolveWinnerBySets()', () => {
  it('returns "side1" when player one wins majority in a 3set match (2-0)', () => {
    const input = makeInput([6, 6], [3, 3]);
    expect(resolveWinnerBySets('3set', input)).toBe('side1');
  });

  it('returns "side2" when player two wins majority in a 3set match (0-2)', () => {
    const input = makeInput([3, 3], [6, 6]);
    expect(resolveWinnerBySets('3set', input)).toBe('side2');
  });

  it('returns null when match is still in progress (1-1 in a 3-set match)', () => {
    const input = makeInput([6, 3], [3, 6]);
    expect(resolveWinnerBySets('3set', input)).toBeNull();
  });

  it('returns "side1" for a 1set match won by player one', () => {
    const input = makeInput([6], [3]);
    expect(resolveWinnerBySets('1set', input)).toBe('side1');
  });

  it('returns "side2" for a 1set match won by player two', () => {
    const input = makeInput([3], [6]);
    expect(resolveWinnerBySets('1set', input)).toBe('side2');
  });

  it('returns null when no scores are provided yet', () => {
    const input = makeInput([], []);
    expect(resolveWinnerBySets('3set', input)).toBeNull();
  });

  it('returns "side2" immediately when player two has walkover in set 1', () => {
    const input = makeInput(['wo'], [6]);
    expect(resolveWinnerBySets('1set', input)).toBe('side2');
  });

  it("returns 'side1' immediately when player one's opponent has walkover", () => {
    const input = makeInput([6], ['wo']);
    expect(resolveWinnerBySets('1set', input)).toBe('side1');
  });

  it('returns "side1" for 5set match with 3-0 sweep', () => {
    const input = makeInput([6, 6, 6, null, null], [3, 3, 3, null, null]);
    expect(resolveWinnerBySets('5set', input)).toBe('side1');
  });
});

// ── normalizeMatchStatus ───────────────────────────────────────────────────

describe('normalizeMatchStatus()', () => {
  it('maps "finished" → "completed"', () => {
    expect(normalizeMatchStatus('finished')).toBe('completed');
  });

  it('maps any other status → "pendingScore"', () => {
    expect(normalizeMatchStatus('pendingScore')).toBe('pendingScore');
    expect(normalizeMatchStatus('active')).toBe('pendingScore');
    expect(normalizeMatchStatus('')).toBe('pendingScore');
  });
});
