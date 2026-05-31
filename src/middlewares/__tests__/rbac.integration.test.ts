import { ROLES } from '../../constants/roles';
import type { AuthenticatedRequest } from '../../shared/authContext';
import { makeNext, makeReq, makeRes, makeUser } from '../../testUtils/middlewareTestUtils';
import {
  requireClubAdminOrAbove,
  requireExactRoles,
  requireOrganiserOrAbove,
  requirePlayerOrAbove,
  requireRole,
  requireRoles,
  requireSuperAdmin,
} from '../rbac';

function makeAuthenticatedReq(role: (typeof ROLES)[keyof typeof ROLES]): AuthenticatedRequest {
  return makeReq({ user: makeUser(role) }) as AuthenticatedRequest;
}

// ---------- requireRole ----------

describe('requireRole()', () => {
  it('calls next() when the user has the exact role', () => {
    const req = makeAuthenticatedReq(ROLES.ORGANISER);
    const res = makeRes();
    const next = makeNext();

    requireRole(ROLES.ORGANISER)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when the user does not have the exact role', () => {
    const req = makeAuthenticatedReq(ROLES.CLUB_ADMIN);
    const res = makeRes();
    const next = makeNext();

    requireRole(ROLES.ORGANISER)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'Forbidden' });
  });
});

// ---------- requireRoles ----------

describe('requireRoles()', () => {
  it('calls next() when the user has the exact required role', () => {
    const req = makeReq({ user: makeUser(ROLES.PLAYER) });
    const res = makeRes();
    const next = makeNext();

    requireRoles(ROLES.PLAYER)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() when the user has a higher role (hierarchy aware)', () => {
    const req = makeReq({ user: makeUser(ROLES.SUPER_ADMIN) });
    const res = makeRes();
    const next = makeNext();

    // Gate is organiser-level, but super_admin passes
    requireRoles(ROLES.ORGANISER)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when the user role is below the required level', () => {
    const req = makeReq({ user: makeUser(ROLES.PLAYER) });
    const res = makeRes();
    const next = makeNext();

    requireRoles(ROLES.ORGANISER)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'FORBIDDEN' })
    );
  });

  it('returns 401 when req.user is not set', () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = makeNext();

    requireRoles(ROLES.PLAYER)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('allows super_admin to pass any single-role gate', () => {
    const req = makeReq({ user: makeUser(ROLES.SUPER_ADMIN) });
    const res = makeRes();
    const next = makeNext();

    for (const role of Object.values(ROLES)) {
      next.mockClear();
      requireRoles(role)(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('returns 403 for organiser trying to access super_admin-only gate', () => {
    const req = makeReq({ user: makeUser(ROLES.ORGANISER) });
    const res = makeRes();
    const next = makeNext();

    requireRoles(ROLES.SUPER_ADMIN)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when no allowed roles are configured', () => {
    const req = makeReq({ user: makeUser(ROLES.SUPER_ADMIN) });
    const res = makeRes();
    const next = makeNext();

    requireRoles()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      message: 'Insufficient permissions',
      code: 'FORBIDDEN',
    });
  });
});

// ---------- requireExactRoles ----------

describe('requireExactRoles()', () => {
  it('calls next() when user role is in the allowed list', () => {
    const req = makeReq({ user: makeUser(ROLES.ORGANISER) });
    const res = makeRes();
    const next = makeNext();

    requireExactRoles(ROLES.ORGANISER, ROLES.CLUB_ADMIN)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when user role is higher but NOT in exact list (no hierarchy)', () => {
    // super_admin is NOT in [organiser, club_admin] exact list
    const req = makeReq({ user: makeUser(ROLES.SUPER_ADMIN) });
    const res = makeRes();
    const next = makeNext();

    requireExactRoles(ROLES.ORGANISER, ROLES.CLUB_ADMIN)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 when user is not set', () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = makeNext();

    requireExactRoles(ROLES.PLAYER)(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ---------- exported role gates ----------

describe('exported RBAC gates', () => {
  it('requires super admin for requireSuperAdmin', () => {
    const allowedReq = makeReq({ user: makeUser(ROLES.SUPER_ADMIN) });
    const deniedReq = makeReq({ user: makeUser(ROLES.CLUB_ADMIN) });
    const allowedRes = makeRes();
    const deniedRes = makeRes();
    const allowedNext = makeNext();
    const deniedNext = makeNext();

    requireSuperAdmin(allowedReq, allowedRes, allowedNext);
    requireSuperAdmin(deniedReq, deniedRes, deniedNext);

    expect(allowedNext).toHaveBeenCalledTimes(1);
    expect(deniedNext).not.toHaveBeenCalled();
    expect(deniedRes.statusCode).toBe(403);
  });

  it('allows the expected hierarchy for reusable role gates', () => {
    const gateCases = [
      { gate: requireClubAdminOrAbove, allowed: ROLES.CLUB_ADMIN, denied: ROLES.ORGANISER },
      { gate: requireOrganiserOrAbove, allowed: ROLES.ORGANISER, denied: ROLES.PLAYER },
      { gate: requirePlayerOrAbove, allowed: ROLES.PLAYER, denied: undefined },
    ] as const;

    for (const testCase of gateCases) {
      const allowedReq = makeReq({ user: makeUser(testCase.allowed) });
      const allowedRes = makeRes();
      const allowedNext = makeNext();

      testCase.gate(allowedReq, allowedRes, allowedNext);

      expect(allowedNext).toHaveBeenCalledTimes(1);
      expect(allowedRes.status).not.toHaveBeenCalled();

      const deniedReq = makeReq(
        testCase.denied ? { user: makeUser(testCase.denied) } : undefined
      );
      const deniedRes = makeRes();
      const deniedNext = makeNext();

      testCase.gate(deniedReq, deniedRes, deniedNext);

      expect(deniedNext).not.toHaveBeenCalled();
      expect(deniedRes.statusCode).toBe(testCase.denied ? 403 : 401);
    }
  });
});
