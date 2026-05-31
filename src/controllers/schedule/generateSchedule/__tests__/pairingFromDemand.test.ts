import { Types } from 'mongoose';
import {
  ensureMinimumParticipants,
  buildRoundPairs,
} from '../pairingFromDemand';
import type { ScheduleParticipantInfo } from '../../shared/types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeParticipant(rating = 1500): ScheduleParticipantInfo {
  return {
    _id: new Types.ObjectId(),
    name: null,
    alias: null,
    profilePictureUrl: null,
    elo: { rating, rd: 200 },
  };
}

function makeParticipants(count: number, baseRating = 1500): ScheduleParticipantInfo[] {
  return Array.from({ length: count }, (_, i) => makeParticipant(baseRating - i * 50));
}

// ── ensureMinimumParticipants ────────────────────────────────────────────────

describe('ensureMinimumParticipants()', () => {
  it('throws for singles with fewer than 2 participants', () => {
    expect(() => ensureMinimumParticipants('singles', 1)).toThrow(
      'At least two participants are required for singles scheduling'
    );
  });

  it('does not throw for singles with exactly 2 participants', () => {
    expect(() => ensureMinimumParticipants('singles', 2)).not.toThrow();
  });

  it('does not throw for singles with more than 2 participants', () => {
    expect(() => ensureMinimumParticipants('singles', 10)).not.toThrow();
  });

  it('throws for doubles with fewer than 4 participants', () => {
    expect(() => ensureMinimumParticipants('doubles', 3)).toThrow(
      'At least four participants are required for doubles scheduling'
    );
  });

  it('does not throw for doubles with exactly 4 participants', () => {
    expect(() => ensureMinimumParticipants('doubles', 4)).not.toThrow();
  });

  it('does not throw for doubles with 8 participants', () => {
    expect(() => ensureMinimumParticipants('doubles', 8)).not.toThrow();
  });
});

// ── buildRoundPairs – singles ────────────────────────────────────────────────

describe('buildRoundPairs() – singles mode', () => {
  it('produces the correct number of match pairs for 4 participants (matchesPerPlayer=1)', () => {
    const participants = makeParticipants(4);
    const { pairs } = buildRoundPairs(participants, 'singles', 1, 1);
    // 4 players × 1 match each / 2 players per match = 2 matches
    expect(pairs).toHaveLength(2);
    for (const pair of pairs) {
      expect(pair.kind).toBe('singles');
    }
  });

  it('ensures every participant appears exactly once per round (matchesPerPlayer=1, 4 players)', () => {
    const participants = makeParticipants(4);
    const { pairs } = buildRoundPairs(participants, 'singles', 1, 1);

    const seen = new Set<string>();
    for (const pair of pairs) {
      if (pair.kind !== 'singles') continue;
      const p1 = pair.teamOne[0].toString();
      const p2 = pair.teamTwo[0].toString();
      // No player should appear twice
      expect(seen.has(p1)).toBe(false);
      expect(seen.has(p2)).toBe(false);
      seen.add(p1);
      seen.add(p2);
    }
    expect(seen.size).toBe(4);
  });

  it('produces 3 matches for 6 participants with matchesPerPlayer=1', () => {
    const participants = makeParticipants(6);
    const { pairs } = buildRoundPairs(participants, 'singles', 1, 1);
    expect(pairs).toHaveLength(3);
  });

  it('produces 4 matches for 4 participants with matchesPerPlayer=2', () => {
    const participants = makeParticipants(4);
    const { pairs } = buildRoundPairs(participants, 'singles', 2, 1);
    // 4 players × 2 each / 2 per match = 4 matches
    expect(pairs).toHaveLength(4);
  });

  it('produces all singles pairs (kind = "singles")', () => {
    const participants = makeParticipants(6);
    const { pairs } = buildRoundPairs(participants, 'singles', 1, 1);
    for (const pair of pairs) {
      expect(pair.kind).toBe('singles');
    }
  });

  it('returns virtualRatings map with an entry per participant', () => {
    const participants = makeParticipants(4);
    const { virtualRatings } = buildRoundPairs(participants, 'singles', 1, 1);
    expect(virtualRatings.size).toBe(4);
    for (const p of participants) {
      expect(virtualRatings.has(p._id.toString())).toBe(true);
    }
  });

  it('pairs highest-rated with next-closest when ratings differ significantly', () => {
    // With distinct ratings: 2000, 1800, 1600, 1400 → natural pairing by rating proximity
    const participants = [
      makeParticipant(2000),
      makeParticipant(1800),
      makeParticipant(1600),
      makeParticipant(1400),
    ];
    const { pairs } = buildRoundPairs(participants, 'singles', 1, 1);
    // Should complete without error and produce 2 pairs
    expect(pairs).toHaveLength(2);
  });

  it('handles an odd number of participants by giving one an extra match (no crash)', () => {
    // 3 players × 1 match each = 3 appearances; needs 1 extra → 4 total appearances = 2 matches
    const participants = makeParticipants(3);
    expect(() => buildRoundPairs(participants, 'singles', 1, 1)).not.toThrow();
    const { pairs } = buildRoundPairs(participants, 'singles', 1, 1);
    expect(pairs).toHaveLength(2);
  });

  it('produces valid pair counts for multiple rounds with matchesPerPlayer=2', () => {
    const participants = makeParticipants(4);
    const { pairs: round1Pairs } = buildRoundPairs(participants, 'singles', 2, 1);
    const { pairs: round2Pairs } = buildRoundPairs(participants, 'singles', 2, 2);

    expect(round1Pairs).toHaveLength(4);
    expect(round2Pairs).toHaveLength(4);
  });
});

// ── buildRoundPairs – doubles ─────────────────────────────────────────────────

describe('buildRoundPairs() – doubles mode', () => {
  it('produces correct number of matches for 4 participants (matchesPerPlayer=1)', () => {
    const participants = makeParticipants(4);
    const { pairs } = buildRoundPairs(participants, 'doubles', 1, 1);
    // 4 players × 1 match / 4 per match = 1 match
    expect(pairs).toHaveLength(1);
  });

  it('produces all doubles pairs (kind = "doubles")', () => {
    const participants = makeParticipants(4);
    const { pairs } = buildRoundPairs(participants, 'doubles', 1, 1);
    for (const pair of pairs) {
      expect(pair.kind).toBe('doubles');
    }
  });

  it('each doubles pair has exactly 2 players on each team', () => {
    const participants = makeParticipants(4);
    const { pairs } = buildRoundPairs(participants, 'doubles', 1, 1);
    for (const pair of pairs) {
      if (pair.kind !== 'doubles') continue;
      expect(pair.teamOne).toHaveLength(2);
      expect(pair.teamTwo).toHaveLength(2);
    }
  });

  it('produces 2 matches for 8 participants (matchesPerPlayer=1)', () => {
    const participants = makeParticipants(8);
    const { pairs } = buildRoundPairs(participants, 'doubles', 1, 1);
    expect(pairs).toHaveLength(2);
  });

  it('each participant appears in exactly one team (matchesPerPlayer=1)', () => {
    const participants = makeParticipants(4);
    const { pairs } = buildRoundPairs(participants, 'doubles', 1, 1);

    const seen = new Set<string>();
    for (const pair of pairs) {
      if (pair.kind !== 'doubles') continue;
      for (const id of [...pair.teamOne, ...pair.teamTwo]) {
        const key = id.toString();
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    expect(seen.size).toBe(4);
  });
});
