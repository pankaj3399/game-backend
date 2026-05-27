import { Types } from 'mongoose';
import { mapAdminClubsResponse } from '../mapper';
import type { AdminClubDoc } from '../types';

function makeClub(overrides: Partial<AdminClubDoc> = {}): AdminClubDoc {
  return {
    _id: new Types.ObjectId(),
    name: 'Test Club',
    logoUrl: undefined,
    ...overrides,
  } as AdminClubDoc;
}

describe('mapAdminClubsResponse()', () => {
  it('maps a single club with all counts from the maps', () => {
    const club = makeClub({ name: 'Alpha Club' });
    const id = club._id.toString();

    const courtMap = new Map([[id, 4]]);
    const membersMap = new Map([[id, 32]]);
    const eventsMap = new Map([[id, 7]]);

    const result = mapAdminClubsResponse([club], courtMap, membersMap, eventsMap);
    expect(result.clubs).toHaveLength(1);
    const mapped = result.clubs[0];
    expect(mapped.id).toBe(id);
    expect(mapped.name).toBe('Alpha Club');
    expect(mapped.courtCount).toBe(4);
    expect(mapped.membersCount).toBe(32);
    expect(mapped.eventsCount).toBe(7);
  });

  it('defaults all counts to 0 when the club is not in any map', () => {
    const club = makeClub();
    const result = mapAdminClubsResponse(
      [club],
      new Map(),
      new Map(),
      new Map(),
    );
    const mapped = result.clubs[0];
    expect(mapped.courtCount).toBe(0);
    expect(mapped.membersCount).toBe(0);
    expect(mapped.eventsCount).toBe(0);
  });

  it('returns null for logoUrl when undefined on the doc', () => {
    const club = makeClub({ logoUrl: undefined });
    const id = club._id.toString();
    const result = mapAdminClubsResponse([club], new Map(), new Map(), new Map());
    expect(result.clubs[0].logoUrl).toBeNull();
  });

  it('passes through a logoUrl string when present', () => {
    const club = makeClub({ logoUrl: 'https://example.com/logo.png' });
    const id = club._id.toString();
    const result = mapAdminClubsResponse(
      [club],
      new Map([[id, 1]]),
      new Map([[id, 5]]),
      new Map([[id, 2]]),
    );
    expect(result.clubs[0].logoUrl).toBe('https://example.com/logo.png');
  });

  it('maps multiple clubs independently', () => {
    const c1 = makeClub({ name: 'Club One' });
    const c2 = makeClub({ name: 'Club Two' });
    const id1 = c1._id.toString();
    const id2 = c2._id.toString();

    const courtMap = new Map([[id1, 3], [id2, 6]]);
    const membersMap = new Map([[id1, 10], [id2, 20]]);
    const eventsMap = new Map([[id1, 1], [id2, 2]]);

    const result = mapAdminClubsResponse([c1, c2], courtMap, membersMap, eventsMap);
    expect(result.clubs).toHaveLength(2);
    expect(result.clubs[0].name).toBe('Club One');
    expect(result.clubs[0].courtCount).toBe(3);
    expect(result.clubs[1].name).toBe('Club Two');
    expect(result.clubs[1].courtCount).toBe(6);
  });

  it('returns an empty clubs array when given no clubs', () => {
    const result = mapAdminClubsResponse([], new Map(), new Map(), new Map());
    expect(result.clubs).toEqual([]);
  });
});
