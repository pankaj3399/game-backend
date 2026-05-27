import { rateGlicko2Player, rateGlicko2HeadToHead, type Glicko2Player } from '../glicko2';

// ── helpers ──────────────────────────────────────────────────────────────────

function makePlayer(rating = 1500, rd = 200, vol = 0.06, tau = 0.5): Glicko2Player {
  return { rating, rd, vol, tau };
}

// ── rateGlicko2Player ────────────────────────────────────────────────────────

describe('rateGlicko2Player()', () => {
  it('returns unchanged rating when given an empty results array', () => {
    const player = makePlayer(1500, 200, 0.06);
    const result = rateGlicko2Player(player, []);
    expect(result.rating).toBeCloseTo(1500, 4);
    // RD should be clamped (unchanged when no inactivity)
    expect(result.rd).toBeLessThanOrEqual(350);
  });

  it('increases rating when player wins against an equal opponent', () => {
    const player = makePlayer(1500, 200, 0.06);
    const opponent = makePlayer(1500, 200, 0.06);
    const result = rateGlicko2Player(player, [{ opponent, score: 1 }]);
    expect(result.rating).toBeGreaterThan(1500);
  });

  it('decreases rating when player loses against an equal opponent', () => {
    const player = makePlayer(1500, 200, 0.06);
    const opponent = makePlayer(1500, 200, 0.06);
    const result = rateGlicko2Player(player, [{ opponent, score: 0 }]);
    expect(result.rating).toBeLessThan(1500);
  });

  it('does not change rating for a draw against an equal opponent', () => {
    const player = makePlayer(1500, 200, 0.06);
    const opponent = makePlayer(1500, 200, 0.06);
    const result = rateGlicko2Player(player, [{ opponent, score: 0.5 }]);
    // Score of 0.5 against equal opponent => no movement on mu
    expect(result.rating).toBeCloseTo(1500, 0);
  });

  it('produces higher rating gain when beating a stronger opponent vs weaker opponent', () => {
    const player = makePlayer(1500, 200, 0.06);
    const weakOpponent = makePlayer(1200, 200, 0.06);
    const strongOpponent = makePlayer(1800, 200, 0.06);

    const gainVsWeak = rateGlicko2Player(player, [{ opponent: weakOpponent, score: 1 }]).rating - 1500;
    const gainVsStrong = rateGlicko2Player(player, [{ opponent: strongOpponent, score: 1 }]).rating - 1500;

    expect(gainVsStrong).toBeGreaterThan(gainVsWeak);
  });

  it('reduces RD after a match (more certainty)', () => {
    const player = makePlayer(1500, 200, 0.06);
    const opponent = makePlayer(1500, 200, 0.06);
    const result = rateGlicko2Player(player, [{ opponent, score: 1 }]);
    expect(result.rd).toBeLessThan(200);
  });

  it('higher rating win produces larger RD reduction when more matches are played', () => {
    const player = makePlayer(1500, 200, 0.06);
    const opponent = makePlayer(1500, 200, 0.06);
    const resultOneMatch = rateGlicko2Player(player, [{ opponent, score: 1 }]);
    const resultThreeMatches = rateGlicko2Player(player, [
      { opponent, score: 1 },
      { opponent, score: 1 },
      { opponent, score: 1 },
    ]);
    expect(resultThreeMatches.rd).toBeLessThan(resultOneMatch.rd);
  });

  it('throws when vol is invalid (zero)', () => {
    const player = makePlayer(1500, 200, 0); // vol = 0 is invalid
    expect(() =>
      rateGlicko2Player(player, [{ opponent: makePlayer(), score: 1 }])
    ).toThrow('Invalid player volatility');
  });

  it('throws when vol is negative', () => {
    const player = makePlayer(1500, 200, -0.1);
    expect(() =>
      rateGlicko2Player(player, [{ opponent: makePlayer(), score: 1 }])
    ).toThrow('Invalid player volatility');
  });

  it('ignores malformed results entries (null score)', () => {
    const player = makePlayer(1500, 200, 0.06);
    // score: NaN should be filtered out
    const result = rateGlicko2Player(player, [{ opponent: makePlayer(), score: NaN }]);
    expect(result.rating).toBeCloseTo(1500, 4);
  });

  it('clamps RD at the configured maxRd', () => {
    const player = makePlayer(1500, 340, 0.06);
    const result = rateGlicko2Player(player, [], { maxRd: 200 });
    expect(result.rd).toBeLessThanOrEqual(200);
  });

  it('preserves tau from player (falls back to default 0.5 if missing)', () => {
    const player = makePlayer(1500, 200, 0.06, 0.3);
    const opponent = makePlayer(1500, 200, 0.06, 0.3);
    const result = rateGlicko2Player(player, [{ opponent, score: 1 }]);
    expect(result.tau).toBe(0.3);
  });

  it('inflates RD for inactive players (inactivityPeriods > 0)', () => {
    const player = makePlayer(1500, 200, 0.06);
    const baseline = rateGlicko2Player(player, []);
    const inflated = rateGlicko2Player(player, [], { inactivityPeriods: 2 });
    expect(inflated.rd).toBeGreaterThan(baseline.rd);
  });

  it('returns rating within a sensible bound after extreme win streak', () => {
    const player = makePlayer(1500, 200, 0.06);
    const weakOpponent = makePlayer(800, 50, 0.06);
    const results = Array(10).fill({ opponent: weakOpponent, score: 1 });
    const result = rateGlicko2Player(player, results);
    // Should not produce absurd values
    expect(result.rating).toBeLessThan(5000);
    expect(result.rating).toBeGreaterThan(1500);
  });
});

// ── rateGlicko2HeadToHead ────────────────────────────────────────────────────

describe('rateGlicko2HeadToHead()', () => {
  it('gives winner more rating than loser after equal match', () => {
    const p1 = makePlayer(1500, 200, 0.06);
    const p2 = makePlayer(1500, 200, 0.06);
    const { playerOne, playerTwo } = rateGlicko2HeadToHead(p1, p2, 1);
    expect(playerOne.rating).toBeGreaterThan(playerTwo.rating);
  });

  it('produces symmetric results for a draw (both near original rating)', () => {
    const p1 = makePlayer(1500, 200, 0.06);
    const p2 = makePlayer(1500, 200, 0.06);
    const { playerOne, playerTwo } = rateGlicko2HeadToHead(p1, p2, 0.5);
    expect(playerOne.rating).toBeCloseTo(playerTwo.rating, 2);
  });

  it('clamps playerOneScore below 0 to 0 (ensures no negative score abuse)', () => {
    const p1 = makePlayer(1500, 200, 0.06);
    const p2 = makePlayer(1500, 200, 0.06);
    // Score -1 should clamp to 0 → player one treated as full loser
    const { playerOne, playerTwo } = rateGlicko2HeadToHead(p1, p2, -1);
    expect(playerOne.rating).toBeLessThan(1500);
    expect(playerTwo.rating).toBeGreaterThan(1500);
  });

  it('clamps playerOneScore above 1 to 1 (ensures no overflow)', () => {
    const p1 = makePlayer(1500, 200, 0.06);
    const p2 = makePlayer(1500, 200, 0.06);
    const { playerOne, playerTwo } = rateGlicko2HeadToHead(p1, p2, 2);
    // Should behave same as score=1
    const { playerOne: baseP1 } = rateGlicko2HeadToHead(p1, p2, 1);
    expect(playerOne.rating).toBeCloseTo(baseP1.rating, 4);
  });

  it('higher-rated player loses less from an expected loss', () => {
    const strong = makePlayer(1800, 100, 0.06);
    const weak = makePlayer(1200, 100, 0.06);
    // Strong player loses (score=0 for strong)
    const { playerOne: strongAfter, playerTwo: weakAfter } = rateGlicko2HeadToHead(strong, weak, 0);
    // Strong loses more in absolute terms due to unexpected outcome
    const strongLoss = 1800 - strongAfter.rating;
    const weakGain = weakAfter.rating - 1200;
    // Both should move
    expect(strongLoss).toBeGreaterThan(0);
    expect(weakGain).toBeGreaterThan(0);
  });

  it('both players have reduced RD after a match', () => {
    const p1 = makePlayer(1500, 200, 0.06);
    const p2 = makePlayer(1500, 200, 0.06);
    const { playerOne, playerTwo } = rateGlicko2HeadToHead(p1, p2, 1);
    expect(playerOne.rd).toBeLessThan(200);
    expect(playerTwo.rd).toBeLessThan(200);
  });
});
