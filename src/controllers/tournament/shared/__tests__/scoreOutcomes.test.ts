import { scoreToOutcomes } from '../scoreOutcomes';

describe('scoreToOutcomes()', () => {
  // ── Walkover edge cases ──────────────────────────────────────────────────

  it('returns [0.5] when both players have walkover (mutual forfeit)', () => {
    expect(scoreToOutcomes('wo', 'wo')).toEqual([0.5]);
  });

  it('returns [0] when player one forfeited (their Glicko-style outcome is a loss)', () => {
    expect(scoreToOutcomes('wo', 6)).toEqual([0]);
  });

  it('returns [1] when player two forfeited (player one outcome is a win)', () => {
    expect(scoreToOutcomes(6, 'wo')).toEqual([1]);
  });

  // ── Null / missing scores ────────────────────────────────────────────────

  it('returns [0.5] when either score is null (match not played)', () => {
    expect(scoreToOutcomes(null, null)).toEqual([0.5]);
    expect(scoreToOutcomes(null, 6)).toEqual([0.5]);
    expect(scoreToOutcomes(6, null)).toEqual([0.5]);
  });

  it('returns [0.5] when total games is 0 (avoids division by zero)', () => {
    expect(scoreToOutcomes(0, 0)).toEqual([0.5]);
  });

  // ── Known point distributions ────────────────────────────────────────────

  it('returns [1] for a 1-0 result (all points to player one)', () => {
    // total = 1, playerOne = 1 → step 1: shouldHaveWins = round(1*1/1)=1 > 0 → push(1)
    expect(scoreToOutcomes(1, 0)).toEqual([1]);
  });

  it('returns [0] for a 0-1 result (all points to player two)', () => {
    expect(scoreToOutcomes(0, 1)).toEqual([0]);
  });

  it('produces length equal to total games played', () => {
    const outcomes = scoreToOutcomes(6, 3);
    expect(outcomes.length).toBe(9); // 6 + 3
  });

  it('distributes wins proportionally for a 6-3 result', () => {
    const outcomes = scoreToOutcomes(6, 3);
    const wins = outcomes.filter((o) => o === 1).length;
    const losses = outcomes.filter((o) => o === 0).length;
    expect(wins).toBe(6);
    expect(losses).toBe(3);
  });

  it('distributes wins proportionally for a 3-6 result', () => {
    const outcomes = scoreToOutcomes(3, 6);
    const wins = outcomes.filter((o) => o === 1).length;
    expect(wins).toBe(3);
  });

  it('handles a perfectly even split 6-6', () => {
    const outcomes = scoreToOutcomes(6, 6);
    expect(outcomes.length).toBe(12);
    const wins = outcomes.filter((o) => o === 1).length;
    expect(wins).toBe(6);
  });

  it('handles a very lopsided result 10-0', () => {
    const outcomes = scoreToOutcomes(10, 0);
    expect(outcomes).toEqual(Array(10).fill(1));
  });
});
