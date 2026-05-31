import type { Request, Response, NextFunction } from 'express';
import { ROLES } from '../../constants/roles';
import { requireExactRoles, requireRole, requireRoles } from '../rbac';

function mockRes() {
	return {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response;
}

const next = jest.fn() as NextFunction;

beforeEach(() => {
	jest.clearAllMocks();
});

describe('requireRole', () => {
	it('blocks users without exact role', () => {
		const req = { user: { role: ROLES.PLAYER } };
		const res = mockRes();
		requireRole(ROLES.CLUB_ADMIN)(req as never, res, next);
		expect(res.status).toHaveBeenCalledWith(403);
	});

	it('allows matching role', () => {
		const req = { user: { role: ROLES.CLUB_ADMIN } };
		const res = mockRes();
		requireRole(ROLES.CLUB_ADMIN)(req as never, res, next);
		expect(next).toHaveBeenCalled();
	});
});

describe('requireRoles', () => {
	it('returns 401 without user', () => {
		const req = {} as Request;
		const res = mockRes();
		requireRoles(ROLES.PLAYER)(req, res, next);
		expect(res.status).toHaveBeenCalledWith(401);
	});

	it('allows club admin for organiser-or-above gate', () => {
		const req = { user: { role: ROLES.CLUB_ADMIN } };
		const res = mockRes();
		requireRoles(ROLES.ORGANISER, ROLES.CLUB_ADMIN)(req as never, res, next);
		expect(next).toHaveBeenCalled();
	});
});

describe('requireExactRoles', () => {
	it('rejects hierarchy-expanded roles', () => {
		const req = { user: { role: ROLES.CLUB_ADMIN } };
		const res = mockRes();
		requireExactRoles(ROLES.ORGANISER)(req as never, res, next);
		expect(res.status).toHaveBeenCalledWith(403);
	});
});
