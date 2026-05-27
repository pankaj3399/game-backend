import { Types } from 'mongoose';
import { mapFavoriteClubsResponse } from '../mapper';
import type { FavoriteClubsUserDoc } from '../types';

function makeClub(name: string) {
  return { _id: new Types.ObjectId(), name };
}

describe('mapFavoriteClubsResponse()', () => {
  it('maps favorite clubs to id/name pairs', () => {
    const club = makeClub('Alpha Club');
    const doc: FavoriteClubsUserDoc = {
      favoriteClubs: [club],
      homeClub: null,
    };

    const result = mapFavoriteClubsResponse(doc);
    expect(result.favoriteClubs).toHaveLength(1);
    expect(result.favoriteClubs[0].id).toBe(club._id.toString());
    expect(result.favoriteClubs[0].name).toBe('Alpha Club');
  });

  it('returns an empty favoriteClubs array when none are set', () => {
    const doc: FavoriteClubsUserDoc = { favoriteClubs: [], homeClub: null };
    const result = mapFavoriteClubsResponse(doc);
    expect(result.favoriteClubs).toEqual([]);
  });

  it('maps homeClub to id/name when present', () => {
    const home = makeClub('Home Club');
    const doc: FavoriteClubsUserDoc = {
      favoriteClubs: [],
      homeClub: home,
    };
    const result = mapFavoriteClubsResponse(doc);
    expect(result.homeClub).not.toBeNull();
    expect(result.homeClub!.id).toBe(home._id.toString());
    expect(result.homeClub!.name).toBe('Home Club');
  });

  it('returns null for homeClub when not set', () => {
    const doc: FavoriteClubsUserDoc = { favoriteClubs: [], homeClub: null };
    expect(mapFavoriteClubsResponse(doc).homeClub).toBeNull();
  });

  it('maps multiple favorite clubs preserving order', () => {
    const c1 = makeClub('Club A');
    const c2 = makeClub('Club B');
    const doc: FavoriteClubsUserDoc = {
      favoriteClubs: [c1, c2],
      homeClub: null,
    };
    const result = mapFavoriteClubsResponse(doc);
    expect(result.favoriteClubs[0].name).toBe('Club A');
    expect(result.favoriteClubs[1].name).toBe('Club B');
  });
});
