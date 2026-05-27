import { Types } from 'mongoose';
import {
  computeClubStaffPermissionsForActor,
  type ClubStaffActorFields,
  type ClubStaffAccessSnapshot,
} from '../clubStaffPermissions';

const clubId = new Types.ObjectId().toString();
const defaultAdminId = new Types.ObjectId().toString();
const otherUserId = new Types.ObjectId().toString();

function makeClub(overrides?: Partial<ClubStaffAccessSnapshot>): ClubStaffAccessSnapshot {
  return {
    defaultAdminId: { toString: () => defaultAdminId },
    ...overrides,
  };
}

function makeActor(overrides?: Partial<ClubStaffActorFields>): ClubStaffActorFields {
  return {
    id: otherUserId,
    role: 'player',
    adminOf: [],
    ...overrides,
  };
}

describe('computeClubStaffPermissionsForActor()', () => {
  it('returns ok: false when actor is a plain player with no club membership', () => {
    const result = computeClubStaffPermissionsForActor(makeClub(), clubId, makeActor());
    expect(result.ok).toBe(false);
  });

  it('returns ok: false when actor is organiser but not a club admin', () => {
    const result = computeClubStaffPermissionsForActor(
      makeClub(),
      clubId,
      makeActor({ role: 'organiser' })
    );
    expect(result.ok).toBe(false);
  });

  it('super_admin always gets ok: true', () => {
    const result = computeClubStaffPermissionsForActor(
      makeClub(),
      clubId,
      makeActor({ role: 'super_admin' })
    );
    expect(result.ok).toBe(true);
  });

  it('super_admin can manage organisers', () => {
    const result = computeClubStaffPermissionsForActor(
      makeClub(),
      clubId,
      makeActor({ role: 'super_admin' })
    );
    if (!result.ok) throw new Error('Expected ok');
    expect(result.canManageOrganisers).toBe(true);
  });

  it('super_admin can manage admins', () => {
    const result = computeClubStaffPermissionsForActor(
      makeClub(),
      clubId,
      makeActor({ role: 'super_admin' })
    );
    if (!result.ok) throw new Error('Expected ok');
    expect(result.canManageAdmins).toBe(true);
  });

  it('club admin (non-default) can manage organisers but NOT admins', () => {
    const result = computeClubStaffPermissionsForActor(
      makeClub(),
      clubId,
      makeActor({ role: 'club_admin', adminOf: [clubId], id: otherUserId })
    );
    if (!result.ok) throw new Error('Expected ok');
    expect(result.canManageOrganisers).toBe(true);
    expect(result.canManageAdmins).toBe(false);
  });

  it('club admin who IS the default admin can manage admins too', () => {
    const result = computeClubStaffPermissionsForActor(
      makeClub(),
      clubId,
      makeActor({ role: 'club_admin', adminOf: [clubId], id: defaultAdminId })
    );
    if (!result.ok) throw new Error('Expected ok');
    expect(result.canManageOrganisers).toBe(true);
    expect(result.canManageAdmins).toBe(true);
  });

  it('club admin of a DIFFERENT club has no access to this club', () => {
    const otherClubId = new Types.ObjectId().toString();
    const result = computeClubStaffPermissionsForActor(
      makeClub(),
      clubId,
      makeActor({ role: 'club_admin', adminOf: [otherClubId] })
    );
    expect(result.ok).toBe(false);
  });

  it('works when defaultAdminId is null on the club (no default set)', () => {
    const result = computeClubStaffPermissionsForActor(
      { defaultAdminId: null },
      clubId,
      makeActor({ role: 'club_admin', adminOf: [clubId], id: defaultAdminId })
    );
    if (!result.ok) throw new Error('Expected ok');
    // defaultAdminId on club is null → isDefaultAdmin = false
    expect(result.canManageAdmins).toBe(false);
  });
});
