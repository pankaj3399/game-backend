import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import authenticate from '../auth';
import Session from '../../models/Session';
import User from '../../models/User';
import { AUTH_TOKEN_AUDIENCE, AUTH_TOKEN_ISSUER, hashSessionToken } from '../../lib/jwtAuth';

jest.mock('../../models/Session');
jest.mock('../../models/User');

function mockRes() {
	const res = {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	};
	return res as unknown as Response;
}

const next = jest.fn() as NextFunction;
const originalJwtSecret = process.env.JWT_SECRET;

beforeEach(() => {
	jest.clearAllMocks();
	process.env.JWT_SECRET = 'unit-test-jwt-secret';
});

afterEach(() => {
	if (originalJwtSecret === undefined) {
		delete process.env.JWT_SECRET;
	} else {
		process.env.JWT_SECRET = originalJwtSecret;
	}
});

describe('authenticate middleware', () => {
	it('returns 401 when no token present', async () => {
		const req = { headers: {} } as Request;
		const res = mockRes();
		await authenticate(req, res, next);
		expect(res.status).toHaveBeenCalledWith(401);
		expect(next).not.toHaveBeenCalled();
	});

	it('attaches user and calls next for valid session', async () => {
		const token = jwt.sign(
			{ sub: '507f1f77bcf86cd799439011' },
			process.env.JWT_SECRET!,
			{ audience: AUTH_TOKEN_AUDIENCE, issuer: AUTH_TOKEN_ISSUER },
		);
		const req = {
			headers: { authorization: `Bearer ${token}` },
			cookies: {},
		} as Request;
		const res = mockRes();
		(Session.findOne as jest.Mock).mockReturnValue({
			exec: jest.fn().mockResolvedValue({ user: '507f1f77bcf86cd799439011' }),
		});
		(User.findById as jest.Mock).mockReturnValue({
			select: () => ({
				exec: jest.fn().mockResolvedValue({
					_id: '507f1f77bcf86cd799439011',
					role: 'player',
				}),
			}),
		});

		await authenticate(req, res, next);
		expect(next).toHaveBeenCalled();
		expect((req as { user?: { _id: string } }).user?._id).toBe('507f1f77bcf86cd799439011');
	});

	it('returns 401 when session is missing', async () => {
		const token = jwt.sign({ sub: 'x' }, process.env.JWT_SECRET!, {
			audience: AUTH_TOKEN_AUDIENCE,
			issuer: AUTH_TOKEN_ISSUER,
		});
		const req = { headers: { authorization: `Bearer ${token}` }, cookies: {} } as Request;
		const res = mockRes();
		(Session.findOne as jest.Mock).mockReturnValue({
			exec: jest.fn().mockResolvedValue(null),
		});

		await authenticate(req, res, next);
		expect(res.status).toHaveBeenCalledWith(401);
		expect(Session.findOne).toHaveBeenCalledWith(
			expect.objectContaining({
				$or: [{ token }, { token: hashSessionToken(token) }],
			}),
		);
	});
});
