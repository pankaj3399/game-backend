import { buildTournamentFilter } from '../helpers';
import type { ListFilterContext } from '../authorize';
import type { TournamentFilter } from '../validation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<ListFilterContext> = {}): ListFilterContext {
  return {
    isOrganiserOrAbove: false,
    isSuperAdmin: false,
    requesterUserId: 'user-abc',
    manageableClubIds: [],
    homeClubCoordinates: null,
    favoriteClubIds: [],
    ...overrides,
  };
}

const baseQuery = {
  page: 1,
  limit: 10,
  view: undefined,
} as const;

function getFilter(result: ReturnType<typeof buildTournamentFilter>): TournamentFilter {
  if (!result.ok) throw new Error('Expected ok result');
  return result.data.filter as TournamentFilter;
}

// ---------------------------------------------------------------------------
// Status filter
// ---------------------------------------------------------------------------

describe('buildTournamentFilter — status', () => {
  it('sets status to "active" for default (published) view', () => {
    const result = buildTournamentFilter({ ...baseQuery }, makeCtx());
    const filter = getFilter(result);
    expect(filter.status).toBe('active');
  });

  it('returns error for drafts view when not organiser', () => {
    const result = buildTournamentFilter(
      { ...baseQuery, view: 'drafts' as const },
      makeCtx({ isOrganiserOrAbove: false, manageableClubIds: [] })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
  });

  it('sets status to "draft" and createdBy for organiser drafts view', () => {
    const ctx = makeCtx({ isOrganiserOrAbove: true, manageableClubIds: ['club-1'] });
    const result = buildTournamentFilter({ ...baseQuery, view: 'drafts' as const }, ctx);
    const filter = getFilter(result);
    expect(filter.status).toBe('draft');
    expect(filter.createdBy).toBe('user-abc');
  });
});

// ---------------------------------------------------------------------------
// Search filter
// ---------------------------------------------------------------------------

describe('buildTournamentFilter — search (q)', () => {
  it('applies regex filter when q is provided', () => {
    const result = buildTournamentFilter({ ...baseQuery, q: 'Open Cup' }, makeCtx());
    const filter = getFilter(result);
    expect(filter.name).toMatchObject({ $regex: 'Open Cup', $options: 'i' });
  });

  it('does not apply name filter when q is whitespace', () => {
    const result = buildTournamentFilter({ ...baseQuery, q: '   ' }, makeCtx());
    const filter = getFilter(result);
    expect(filter.name).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Club filter
// ---------------------------------------------------------------------------

describe('buildTournamentFilter — club filter', () => {
  it('restricts to favorite club ids when clubScope=favorites', () => {
    const ctx = makeCtx({ favoriteClubIds: ['club-x', 'club-y'] });
    const result = buildTournamentFilter({ ...baseQuery, clubScope: 'favorites' as const }, ctx);
    const filter = getFilter(result);
    expect(filter.club).toMatchObject({ $in: ['club-x', 'club-y'] });
  });

  it('returns early-exit filter when favorites is requested but user has none', () => {
    const ctx = makeCtx({ favoriteClubIds: [] });
    const result = buildTournamentFilter({ ...baseQuery, clubScope: 'favorites' as const }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rawFilter = result.data.filter as { _id?: { $in: unknown[] } };
    expect(rawFilter._id?.$in).toHaveLength(0);
  });

  it('restricts to a specific club id when club is provided', () => {
    const result = buildTournamentFilter(
      { ...baseQuery, club: 'aabbccddeeff001122334455' },
      makeCtx()
    );
    const filter = getFilter(result);
    expect(filter.club).toMatchObject({ $in: ['aabbccddeeff001122334455'] });
  });
});

// ---------------------------------------------------------------------------
// Participation filter
// ---------------------------------------------------------------------------

describe('buildTournamentFilter — participation filter', () => {
  it('filters to tournaments where user IS a participant when participation=joined', () => {
    const ctx = makeCtx({ requesterUserId: 'user-abc' });
    const result = buildTournamentFilter(
      { ...baseQuery, participation: 'joined' as const },
      ctx
    );
    const filter = getFilter(result);
    expect(filter.participants).toMatchObject({
      $elemMatch: { $eq: 'user-abc' },
    });
  });

  it('filters to tournaments where user is NOT a participant when participation=notJoined', () => {
    const ctx = makeCtx({ requesterUserId: 'user-abc' });
    const result = buildTournamentFilter(
      { ...baseQuery, participation: 'notJoined' as const },
      ctx
    );
    const filter = getFilter(result);
    expect(filter.participants).toMatchObject({
      $not: { $elemMatch: { $eq: 'user-abc' } },
    });
  });

  it('does NOT apply participation filter when requesterUserId is empty (guest)', () => {
    const ctx = makeCtx({ requesterUserId: '' });
    const result = buildTournamentFilter(
      { ...baseQuery, participation: 'joined' as const },
      ctx
    );
    const filter = getFilter(result);
    expect(filter.participants).toBeUndefined();
  });

  it('does NOT apply participation filter when no participation param is given', () => {
    const result = buildTournamentFilter({ ...baseQuery }, makeCtx());
    const filter = getFilter(result);
    expect(filter.participants).toBeUndefined();
  });

  it('uses the correct userId from context for joined filter', () => {
    const ctx = makeCtx({ requesterUserId: 'specific-user-id-123' });
    const result = buildTournamentFilter(
      { ...baseQuery, participation: 'joined' as const },
      ctx
    );
    const filter = getFilter(result);
    expect(filter.participants).toMatchObject({
      $elemMatch: { $eq: 'specific-user-id-123' },
    });
  });

  it('uses the correct userId from context for notJoined filter', () => {
    const ctx = makeCtx({ requesterUserId: 'specific-user-id-456' });
    const result = buildTournamentFilter(
      { ...baseQuery, participation: 'notJoined' as const },
      ctx
    );
    const filter = getFilter(result);
    expect(filter.participants).toMatchObject({
      $not: { $elemMatch: { $eq: 'specific-user-id-456' } },
    });
  });
});

// ---------------------------------------------------------------------------
// Distance filter
// ---------------------------------------------------------------------------

describe('buildTournamentFilter — distance', () => {
  it('returns error 400 when distance is set but distanceClubIds is undefined', () => {
    const result = buildTournamentFilter(
      { ...baseQuery, distance: 'under50' as const },
      makeCtx({ homeClubCoordinates: [13.4, 52.5] })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
  });

  it('returns early-exit filter when distanceClubIds is an empty array', () => {
    const result = buildTournamentFilter(
      { ...baseQuery, distance: 'under50' as const, distanceClubIds: [] },
      makeCtx({ homeClubCoordinates: [13.4, 52.5] })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rawFilter = result.data.filter as { _id?: { $in: unknown[] } };
    expect(rawFilter._id?.$in).toHaveLength(0);
  });

  it('applies club intersection when distanceClubIds is non-empty', () => {
    const result = buildTournamentFilter(
      { ...baseQuery, distance: 'under50' as const, distanceClubIds: ['club-near'] },
      makeCtx({ homeClubCoordinates: [13.4, 52.5] })
    );
    const filter = getFilter(result);
    expect(filter.club).toMatchObject({ $in: ['club-near'] });
  });
});
