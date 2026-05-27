import { ROLES, hasRoleOrAbove, hasAnyRole } from '../roles';

describe('hasRoleOrAbove()', () => {
  it('player satisfies the player requirement', () => {
    expect(hasRoleOrAbove(ROLES.PLAYER, ROLES.PLAYER)).toBe(true);
  });

  it('player does NOT satisfy organiser requirement', () => {
    expect(hasRoleOrAbove(ROLES.PLAYER, ROLES.ORGANISER)).toBe(false);
  });

  it('player does NOT satisfy club_admin requirement', () => {
    expect(hasRoleOrAbove(ROLES.PLAYER, ROLES.CLUB_ADMIN)).toBe(false);
  });

  it('player does NOT satisfy super_admin requirement', () => {
    expect(hasRoleOrAbove(ROLES.PLAYER, ROLES.SUPER_ADMIN)).toBe(false);
  });

  it('organiser satisfies player requirement (higher rank)', () => {
    expect(hasRoleOrAbove(ROLES.ORGANISER, ROLES.PLAYER)).toBe(true);
  });

  it('organiser satisfies its own requirement', () => {
    expect(hasRoleOrAbove(ROLES.ORGANISER, ROLES.ORGANISER)).toBe(true);
  });

  it('organiser does NOT satisfy club_admin requirement', () => {
    expect(hasRoleOrAbove(ROLES.ORGANISER, ROLES.CLUB_ADMIN)).toBe(false);
  });

  it('super_admin satisfies every role requirement', () => {
    for (const role of Object.values(ROLES)) {
      expect(hasRoleOrAbove(ROLES.SUPER_ADMIN, role)).toBe(true);
    }
  });

  it('returns false for an unknown userRole', () => {
    // @ts-expect-error — testing runtime safety
    expect(hasRoleOrAbove('ghost', ROLES.PLAYER)).toBe(false);
  });

  it('returns false for an unknown required role', () => {
    // @ts-expect-error — testing runtime safety
    expect(hasRoleOrAbove(ROLES.PLAYER, 'ghost')).toBe(false);
  });
});

describe('hasAnyRole()', () => {
  it('returns true for an exact match', () => {
    expect(hasAnyRole(ROLES.PLAYER, [ROLES.PLAYER])).toBe(true);
  });

  it('returns true when role is one of several allowed', () => {
    expect(hasAnyRole(ROLES.ORGANISER, [ROLES.PLAYER, ROLES.ORGANISER])).toBe(true);
  });

  it('returns false when role is not in the allowed list', () => {
    expect(hasAnyRole(ROLES.PLAYER, [ROLES.ORGANISER, ROLES.CLUB_ADMIN])).toBe(false);
  });

  it('returns false for an empty allowed list', () => {
    expect(hasAnyRole(ROLES.SUPER_ADMIN, [])).toBe(false);
  });

  it('returns false for an unknown role', () => {
    // @ts-expect-error — testing runtime safety
    expect(hasAnyRole('ghost', [ROLES.PLAYER])).toBe(false);
  });
});
