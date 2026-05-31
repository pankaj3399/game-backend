import mongoose from 'mongoose';
import { isOwnerOrSuperAdmin, userCanManageClubAsAdmin } from '../permissions';
import { ROLES, type Role } from '../../constants/roles';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeId(): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId();
}

/**
 * isOwnerOrSuperAdmin only reads session.role and session._id.
 * We build a minimal object satisfying that surface and pass it through
 * the parameter type — AuthenticatedSession extends UserDocument which
 * extends Document, so its _id is an ObjectId and role is Role.
 *
 * We use a purposeful cast here ONLY because UserDocument is a full Mongoose
 * document class with 50+ prototype members (save, populate, …) that are
 * irrelevant to the two fields the SUT actually reads. This is the standard
 * pattern for unit-testing functions that accept large framework types.
 */
type SessionStub = Pick<mongoose.Document, '_id'> & { role: Role };

function makeSession(id: mongoose.Types.ObjectId, role: Role): SessionStub {
  return { _id: id, role };
}

// ─────────────────────────────────────────────────────────────────────────────
// isOwnerOrSuperAdmin
// ─────────────────────────────────────────────────────────────────────────────

describe('isOwnerOrSuperAdmin()', () => {
  it('returns true for SUPER_ADMIN regardless of who created the resource', () => {
    const session = makeSession(makeId(), ROLES.SUPER_ADMIN);
    expect(isOwnerOrSuperAdmin(session as never, makeId())).toBe(true);
  });

  it('returns true for SUPER_ADMIN even when resourceCreatedBy is undefined', () => {
    const session = makeSession(makeId(), ROLES.SUPER_ADMIN);
    expect(isOwnerOrSuperAdmin(session as never, undefined)).toBe(true);
  });

  it('returns false when resourceCreatedBy is undefined and role is not SUPER_ADMIN', () => {
    const session = makeSession(makeId(), ROLES.PLAYER);
    expect(isOwnerOrSuperAdmin(session as never, undefined)).toBe(false);
  });

  it('returns true when session._id equals resourceCreatedBy', () => {
    const id = makeId();
    const session = makeSession(id, ROLES.PLAYER);
    expect(isOwnerOrSuperAdmin(session as never, id)).toBe(true);
  });

  it('returns false when session._id does not equal resourceCreatedBy', () => {
    const session = makeSession(makeId(), ROLES.PLAYER);
    expect(isOwnerOrSuperAdmin(session as never, makeId())).toBe(false);
  });

  it('returns false for ORGANISER who is not the resource owner', () => {
    const session = makeSession(makeId(), ROLES.ORGANISER);
    expect(isOwnerOrSuperAdmin(session as never, makeId())).toBe(false);
  });

  it('returns true for ORGANISER who IS the resource owner', () => {
    const id = makeId();
    const session = makeSession(id, ROLES.ORGANISER);
    expect(isOwnerOrSuperAdmin(session as never, id)).toBe(true);
  });

  it('returns false for CLUB_ADMIN who is not the resource owner', () => {
    const session = makeSession(makeId(), ROLES.CLUB_ADMIN);
    expect(isOwnerOrSuperAdmin(session as never, makeId())).toBe(false);
  });

  it('returns true for CLUB_ADMIN who IS the resource owner', () => {
    const id = makeId();
    const session = makeSession(id, ROLES.CLUB_ADMIN);
    expect(isOwnerOrSuperAdmin(session as never, id)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// userCanManageClubAsAdmin
// ─────────────────────────────────────────────────────────────────────────────

describe('userCanManageClubAsAdmin()', () => {
  it('returns true for super_admin regardless of adminOf', () => {
    expect(userCanManageClubAsAdmin(
      { userId: 'u1', userRole: 'super_admin', adminOf: [] },
      makeId().toHexString(),
    )).toBe(true);
  });

  it('returns false when clubId is not a valid ObjectId (non-super_admin)', () => {
    expect(userCanManageClubAsAdmin(
      { userId: 'u1', userRole: 'club_admin', adminOf: [] },
      'not-valid-id',
    )).toBe(false);
  });

  it('returns false when clubId is an empty string', () => {
    expect(userCanManageClubAsAdmin(
      { userId: 'u1', userRole: 'club_admin', adminOf: [] },
      '',
    )).toBe(false);
  });

  it('returns true when clubId is in the adminOf list', () => {
    const clubId = makeId().toHexString();
    expect(userCanManageClubAsAdmin(
      { userId: 'u1', userRole: 'player', adminOf: [clubId] },
      clubId,
    )).toBe(true);
  });

  it('returns false when clubId is not in the adminOf list', () => {
    const clubId = makeId().toHexString();
    expect(userCanManageClubAsAdmin(
      { userId: 'u1', userRole: 'player', adminOf: [makeId().toHexString()] },
      clubId,
    )).toBe(false);
  });

  it('returns false for an empty adminOf array (non-super_admin)', () => {
    expect(userCanManageClubAsAdmin(
      { userId: 'u1', userRole: 'organiser', adminOf: [] },
      makeId().toHexString(),
    )).toBe(false);
  });

  it('handles undefined adminOf gracefully', () => {
    expect(userCanManageClubAsAdmin(
      { userId: 'u1', userRole: 'player', adminOf: undefined as unknown as string[] },
      makeId().toHexString(),
    )).toBe(false);
  });

  it('returns true when adminOf contains multiple clubs including the queried one', () => {
    const clubId = makeId().toHexString();
    expect(userCanManageClubAsAdmin(
      { userId: 'u1', userRole: 'player', adminOf: [makeId().toHexString(), clubId, makeId().toHexString()] },
      clubId,
    )).toBe(true);
  });

  it('does not match a partial club id substring', () => {
    const clubId = makeId().toHexString();
    const partialId = clubId.slice(0, 12);
    expect(userCanManageClubAsAdmin(
      { userId: 'u1', userRole: 'player', adminOf: [partialId] },
      clubId,
    )).toBe(false);
  });

  it('returns true for super_admin even with an invalid clubId format', () => {
    expect(userCanManageClubAsAdmin(
      { userId: 'u1', userRole: 'super_admin', adminOf: [] },
      'invalid-id',
    )).toBe(true);
  });
});
