import { buildTournamentFilter } from '../helpers';
import type { TournamentFilter, ResolvedTournamentQuery } from '../validation';
import type { ListFilterContext } from '../authorize';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts the filter from a successful buildTournamentFilter result.
 * The return type is typed as TournamentFilter so all ITournament fields
 * (status, club, name, createdBy, participants, $or) are accessible without casts.
 *
 * The function asserts ok === true via Jest before calling this, so we only
 * reach it on the happy path.
 */
function getFilter(result: ReturnType<typeof buildTournamentFilter>): TournamentFilter {
  if (!result.ok) {
    throw new Error('Expected ok result but got error');
  }
  // Both ok branches carry { filter }, and TournamentFilter = QueryFilter<ITournament>
  // which is structurally a superset of the narrow early-exit shape { _id: { $in: [] } }
  return result.data.filter as TournamentFilter;
}

function makeQuery(overrides: Partial<ResolvedTournamentQuery> = {}): ResolvedTournamentQuery {
  return {
    view: 'published',
    page: 1,
    limit: 10,
    ...overrides,
  } as ResolvedTournamentQuery;
}

function makeCtx(overrides: Partial<ListFilterContext> = {}): ListFilterContext {
  return {
    isSuperAdmin: false,
    isOrganiserOrAbove: false,
    manageableClubIds: [],
    favoriteClubIds: [],
    homeClubCoordinates: null,
    requesterUserId: 'user-123',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildTournamentFilter — public / published view
// ─────────────────────────────────────────────────────────────────────────────

describe('buildTournamentFilter() — public view', () => {
  it('returns ok for a default public query', () => {
    const result = buildTournamentFilter(makeQuery(), makeCtx());
    expect(result.ok).toBe(true);
  });

  it('sets filter.status to "active" for public view', () => {
    const result = buildTournamentFilter(makeQuery(), makeCtx());
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    expect(filter.status).toBe('active');
  });

  it('does not set filter.createdBy for public view', () => {
    const result = buildTournamentFilter(makeQuery(), makeCtx());
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    expect(filter.createdBy).toBeUndefined();
  });

  it('applies a club $in filter when query.club is provided', () => {
    const clubId = 'a'.repeat(24); // 24-char hex-like string
    const result = buildTournamentFilter(makeQuery({ club: clubId }), makeCtx());
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    const clubFilter = filter.club as { $in: string[] };
    expect(clubFilter.$in).toContain(clubId);
  });

  it('applies a name $regex filter when query.q has content', () => {
    const result = buildTournamentFilter(makeQuery({ q: 'Open Cup' }), makeCtx());
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    const nameFilter = filter.name as { $regex: string; $options: string };
    expect(nameFilter.$regex).toBe('Open Cup');
    expect(nameFilter.$options).toBe('i');
  });

  it('trims whitespace from query.q before applying regex', () => {
    const result = buildTournamentFilter(makeQuery({ q: '  Cup  ' }), makeCtx());
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    const nameFilter = filter.name as { $regex: string };
    expect(nameFilter.$regex).toBe('Cup');
  });

  it('does not set name filter when query.q is blank whitespace', () => {
    const result = buildTournamentFilter(makeQuery({ q: '   ' }), makeCtx());
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    expect(filter.name).toBeUndefined();
  });

  it('applies participation "joined" filter when query.participation is "joined"', () => {
    const result = buildTournamentFilter(
      makeQuery({ participation: 'joined' }),
      makeCtx({ requesterUserId: 'user-123' }),
    );
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    const pFilter = filter.participants as { $elemMatch: { $eq: string } };
    expect(pFilter.$elemMatch.$eq).toBe('user-123');
  });

  it('applies participation "notJoined" filter', () => {
    const result = buildTournamentFilter(
      makeQuery({ participation: 'notJoined' }),
      makeCtx({ requesterUserId: 'user-123' }),
    );
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    const pFilter = filter.participants as { $not: { $elemMatch: { $eq: string } } };
    expect(pFilter.$not.$elemMatch.$eq).toBe('user-123');
  });

  it('applies participation "organisedByMe" filter', () => {
    const result = buildTournamentFilter(
      makeQuery({ participation: 'organisedByMe' }),
      makeCtx({ requesterUserId: 'user-abc' }),
    );
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    expect(filter.createdBy).toBe('user-abc');
  });

  it('does NOT apply participation filter when requesterUserId is empty', () => {
    const result = buildTournamentFilter(
      makeQuery({ participation: 'joined' }),
      makeCtx({ requesterUserId: '' }),
    );
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    expect(filter.participants).toBeUndefined();
  });

  it('applies time window $or filter and includes unscheduled branch for "future"', () => {
    const result = buildTournamentFilter(
      makeQuery({ when: 'future', timezone: 'UTC' }),
      makeCtx(),
    );
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    expect(Array.isArray(filter.$or)).toBe(true);
    const hasUnscheduled = (filter.$or as Array<Record<string, unknown>>).some(
      (branch) => branch.tournamentMode === 'unscheduled',
    );
    expect(hasUnscheduled).toBe(true);
  });

  it('applies time window $or filter for "past"', () => {
    const result = buildTournamentFilter(
      makeQuery({ when: 'past', timezone: 'UTC' }),
      makeCtx(),
    );
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    expect(Array.isArray(filter.$or)).toBe(true);
  });

  it('applies favorites club scope correctly', () => {
    const favs = ['club-1', 'club-2'];
    const result = buildTournamentFilter(
      makeQuery({ clubScope: 'favorites' }),
      makeCtx({ favoriteClubIds: favs }),
    );
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    const clubFilter = filter.club as { $in: string[] };
    expect(clubFilter.$in).toEqual(expect.arrayContaining(favs));
    expect(clubFilter.$in).toHaveLength(2);
  });

  it('returns ok with empty $in when favorites scope resolves to zero clubs', () => {
    const result = buildTournamentFilter(
      makeQuery({ clubScope: 'favorites' }),
      makeCtx({ favoriteClubIds: [] }),
    );
    // Early exit branch: ok({ filter: { _id: { $in: [] } } })
    expect(result.ok).toBe(true);
  });

  it('returns error 400 when distance is set but distanceClubIds is missing', () => {
    const result = buildTournamentFilter(
      makeQuery({ distance: 'under50', distanceClubIds: undefined }),
      makeCtx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  it('returns ok (early exit) when distanceClubIds is an empty array', () => {
    const result = buildTournamentFilter(
      makeQuery({ distance: 'under50', distanceClubIds: [] }),
      makeCtx(),
    );
    expect(result.ok).toBe(true);
  });

  it('intersects distance clubs with favorites when both are specified', () => {
    const favs = ['club-1', 'club-2', 'club-3'];
    const nearby = ['club-2', 'club-3', 'club-4'];
    const result = buildTournamentFilter(
      makeQuery({ clubScope: 'favorites', distance: 'under50', distanceClubIds: nearby }),
      makeCtx({ favoriteClubIds: favs }),
    );
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    const clubFilter = filter.club as { $in: string[] };
    expect([...clubFilter.$in].sort()).toEqual(['club-2', 'club-3']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildTournamentFilter — drafts view
// ─────────────────────────────────────────────────────────────────────────────

describe('buildTournamentFilter() — drafts view', () => {
  it('returns 403 when user is not super admin and not organiser or above', () => {
    const result = buildTournamentFilter(
      makeQuery({ view: 'drafts' }),
      makeCtx({ isSuperAdmin: false, isOrganiserOrAbove: false }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it('returns 403 when organiser has no manageable clubs', () => {
    const result = buildTournamentFilter(
      makeQuery({ view: 'drafts' }),
      makeCtx({ isSuperAdmin: false, isOrganiserOrAbove: true, manageableClubIds: [] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it('returns ok for an organiser with at least one manageable club', () => {
    const result = buildTournamentFilter(
      makeQuery({ view: 'drafts' }),
      makeCtx({ isSuperAdmin: false, isOrganiserOrAbove: true, manageableClubIds: ['club-x'] }),
    );
    expect(result.ok).toBe(true);
  });

  it('returns ok for super admin with no manageable clubs', () => {
    const result = buildTournamentFilter(
      makeQuery({ view: 'drafts' }),
      makeCtx({ isSuperAdmin: true, isOrganiserOrAbove: false, manageableClubIds: [] }),
    );
    expect(result.ok).toBe(true);
  });

  it('sets filter.status to "draft" in drafts view', () => {
    const result = buildTournamentFilter(
      makeQuery({ view: 'drafts' }),
      makeCtx({ isSuperAdmin: true }),
    );
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    expect(filter.status).toBe('draft');
  });

  it('sets filter.createdBy to requesterUserId in drafts view', () => {
    const result = buildTournamentFilter(
      makeQuery({ view: 'drafts' }),
      makeCtx({ isSuperAdmin: true, requesterUserId: 'owner-456' }),
    );
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    expect(filter.createdBy).toBe('owner-456');
  });

  it('returns 403 when drafts view requests a club not in the manageable list', () => {
    const result = buildTournamentFilter(
      makeQuery({ view: 'drafts', club: 'b'.repeat(24) }),
      makeCtx({ isSuperAdmin: false, isOrganiserOrAbove: true, manageableClubIds: ['a'.repeat(24)] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it('allows a drafts view when the requested club is in the manageable list', () => {
    const clubId = 'c'.repeat(24);
    const result = buildTournamentFilter(
      makeQuery({ view: 'drafts', club: clubId }),
      makeCtx({ isSuperAdmin: false, isOrganiserOrAbove: true, manageableClubIds: [clubId] }),
    );
    expect(result.ok).toBe(true);
    const filter = getFilter(result);
    const clubFilter = filter.club as { $in: string[] };
    expect(clubFilter.$in).toContain(clubId);
  });
});
