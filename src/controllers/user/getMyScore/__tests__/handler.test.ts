import { Types } from 'mongoose';
import { getMyScoreFlow } from '../handler';
import { MAX_STANDALONE_GAMES_FETCH } from '../queries';

// ---------- Mock the queries module ----------
// We mock at the module boundary so the handler's logic runs for real.

jest.mock('../queries', () => {
  const actual = jest.requireActual('../queries');
  return {
    ...actual,
    fetchCompletedTournamentGamesForUser: jest.fn(),
    fetchStandaloneGamesForUser: jest.fn(),
    countStandaloneWinsForUser: jest.fn(),
    fetchUserRatingSnapshot: jest.fn(),
    buildStandaloneMyScoreListFilter: jest.fn().mockReturnValue({}),
  };
});

// Also mock the mapper to control individual game mappings
jest.mock('../mapper', () => {
  const actual = jest.requireActual('../mapper');
  return {
    ...actual,
    mapGameToMyScoreEntry: jest.fn(),
  };
});

import {
  fetchCompletedTournamentGamesForUser,
  fetchStandaloneGamesForUser,
  countStandaloneWinsForUser,
  fetchUserRatingSnapshot,
} from '../queries';
import { mapGameToMyScoreEntry } from '../mapper';

const mockFetchTournament = fetchCompletedTournamentGamesForUser as jest.MockedFunction<typeof fetchCompletedTournamentGamesForUser>;
const mockFetchStandalone = fetchStandaloneGamesForUser as jest.MockedFunction<typeof fetchStandaloneGamesForUser>;
const mockCountWins = countStandaloneWinsForUser as jest.MockedFunction<typeof countStandaloneWinsForUser>;
const mockRatingSnapshot = fetchUserRatingSnapshot as jest.MockedFunction<typeof fetchUserRatingSnapshot>;
const mockMapGame = mapGameToMyScoreEntry as jest.MockedFunction<typeof mapGameToMyScoreEntry>;

// ---------- Shared defaults ----------

const VALID_USER_ID = new Types.ObjectId().toString();

const DEFAULT_QUERY = {
  mode: 'all' as const,
  range: 'last30Days' as const,
  page: 1,
  limit: 10,
};

const EMPTY_TOURNAMENT_RESULT = {
  entries: [],
  totalEntries: 0,
  estimatedWins: 0,
  winsTruncated: false,
  page: 1,
};

const EMPTY_STANDALONE_RESULT = {
  entries: [],
  totalEntries: 0,
};

const DEFAULT_RATING_SNAPSHOT = {
  rating: 1500,
  rd: 200,
  displayName: 'Alice',
};

beforeEach(() => {
  jest.clearAllMocks();
  // Set up sensible defaults; individual tests override as needed
  mockFetchTournament.mockResolvedValue(EMPTY_TOURNAMENT_RESULT);
  mockFetchStandalone.mockResolvedValue(EMPTY_STANDALONE_RESULT);
  mockCountWins.mockResolvedValue({ estimatedWins: 0, winsTruncated: false });
  mockRatingSnapshot.mockResolvedValue(DEFAULT_RATING_SNAPSHOT);
});

// ---------- Tests ----------

describe('getMyScoreFlow() — guard conditions', () => {
  it('returns error 404 for a non-ObjectId userId string', async () => {
    const result = await getMyScoreFlow('not-an-object-id', DEFAULT_QUERY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it('returns error 422 when page * limit exceeds MAX_STANDALONE_GAMES_FETCH', async () => {
    const limit = 50;
    const page = Math.floor(MAX_STANDALONE_GAMES_FETCH / limit) + 1;
    const result = await getMyScoreFlow(VALID_USER_ID, { ...DEFAULT_QUERY, page, limit });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.message).toContain(String(MAX_STANDALONE_GAMES_FETCH));
    }
  });

  it('returns error 404 when fetchUserRatingSnapshot returns null', async () => {
    mockRatingSnapshot.mockResolvedValue(null);
    const result = await getMyScoreFlow(VALID_USER_ID, DEFAULT_QUERY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });
});

describe('getMyScoreFlow() — mapping errors', () => {
  it('returns error 500 when mapGameToMyScoreEntry returns null for a standalone game', async () => {
    const fakeGame = { _id: new Types.ObjectId(), side1: { players: [] }, side2: { players: [] }, tournament: null, status: 'finished' as const };
    mockFetchStandalone.mockResolvedValue({ entries: [fakeGame as any], totalEntries: 1 });
    // Force mapper to return null (simulates unmappable game)
    mockMapGame.mockReturnValue(null);

    const result = await getMyScoreFlow(VALID_USER_ID, DEFAULT_QUERY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
    }
  });

  it('returns error 500 when mapGameToMyScoreEntry returns null for a tournament game', async () => {
    const fakeGame = { _id: new Types.ObjectId(), side1: { players: [] }, side2: { players: [] }, tournament: null };
    mockFetchTournament.mockResolvedValue({
      ...EMPTY_TOURNAMENT_RESULT,
      entries: [fakeGame as any],
      totalEntries: 1,
    });
    mockMapGame.mockReturnValue(null);

    const result = await getMyScoreFlow(VALID_USER_ID, DEFAULT_QUERY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
    }
  });
});

describe('getMyScoreFlow() — happy path', () => {
  it('returns ok with correct player fields', async () => {
    const result = await getMyScoreFlow(VALID_USER_ID, DEFAULT_QUERY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.player.id).toBe(VALID_USER_ID);
      expect(result.data.player.displayName).toBe('Alice');
    }
  });

  it('returns ok with glicko2 rating rounded to nearest integer', async () => {
    mockRatingSnapshot.mockResolvedValue({ rating: 1523.7, rd: 187.3, displayName: 'Bob' });
    const result = await getMyScoreFlow(VALID_USER_ID, DEFAULT_QUERY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary.glicko2.rating).toBe(1524);
      expect(result.data.summary.glicko2.rd).toBe(187);
    }
  });

  it('echoes back the requested filters', async () => {
    const query = { ...DEFAULT_QUERY, mode: 'singles' as const, range: 'allTime' as const };
    const result = await getMyScoreFlow(VALID_USER_ID, query);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.filters.mode).toBe('singles');
      expect(result.data.filters.range).toBe('allTime');
    }
  });

  it('returns totalMatches = sum of tournament + standalone entries', async () => {
    mockFetchTournament.mockResolvedValue({ ...EMPTY_TOURNAMENT_RESULT, totalEntries: 5 });
    mockFetchStandalone.mockResolvedValue({ ...EMPTY_STANDALONE_RESULT, totalEntries: 3 });

    const result = await getMyScoreFlow(VALID_USER_ID, DEFAULT_QUERY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary.totalMatches).toBe(8);
    }
  });

  it('merges and paginates entries — returns only requested page slice', async () => {
    // Create 3 standalone entries with specific dates
    const now = Date.now();
    const makeEntry = (offsetMs: number) => ({
      id: new Types.ObjectId().toString(),
      playedAt: new Date(now - offsetMs).toISOString(),
      tournament: { id: null, name: 'Independent match' },
      opponent: { id: 'opp', name: 'Opponent' },
      mode: 'singles' as const,
      myScore: null,
      opponentScore: null,
      didWin: null,
      status: 'finished' as const,
    });

    const entry1 = makeEntry(1000);
    const entry2 = makeEntry(2000);
    const entry3 = makeEntry(3000);

    const fakeGame = { _id: new Types.ObjectId(), side1: { players: [] }, side2: { players: [] }, tournament: null, status: 'finished' as const };

    mockFetchStandalone.mockResolvedValue({
      entries: [fakeGame, fakeGame, fakeGame] as any,
      totalEntries: 3,
    });

    // Return different entries per call based on the game
    mockMapGame
      .mockReturnValueOnce(entry1)
      .mockReturnValueOnce(entry2)
      .mockReturnValueOnce(entry3);

    const result = await getMyScoreFlow(VALID_USER_ID, { ...DEFAULT_QUERY, page: 1, limit: 2 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only 2 entries on page 1
      expect(result.data.entries.length).toBe(2);
      // Sorted newest first: entry1 is most recent (smallest offset)
      expect(result.data.entries[0].playedAt).toBe(entry1.playedAt);
    }
  });

  it('pagination totalPages is at least 1 even with 0 entries', async () => {
    const result = await getMyScoreFlow(VALID_USER_ID, DEFAULT_QUERY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pagination.totalPages).toBeGreaterThanOrEqual(1);
    }
  });

  it('caps totalPages to floor(MAX / limit) to prevent exceeding depth guard', async () => {
    const limit = 10;
    // Pretend there are 10000 entries — but MAX caps the real total
    mockFetchTournament.mockResolvedValue({ ...EMPTY_TOURNAMENT_RESULT, totalEntries: 10000 });
    const result = await getMyScoreFlow(VALID_USER_ID, { ...DEFAULT_QUERY, limit });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const maxPages = Math.floor(MAX_STANDALONE_GAMES_FETCH / limit);
      expect(result.data.pagination.totalPages).toBeLessThanOrEqual(maxPages);
    }
  });
});
