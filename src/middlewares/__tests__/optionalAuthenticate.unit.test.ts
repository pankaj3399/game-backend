import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import optionalAuthenticate from '../optionalAuthenticate';
import Session from '../../models/Session';
import User from '../../models/User';
import { AUTH_TOKEN_AUDIENCE, AUTH_TOKEN_ISSUER } from '../../lib/jwtAuth';

jest.mock('../../models/Session');
jest.mock('../../models/User');

function mockRes() {
	return {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response;
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

describe('optionalAuthenticate', () => {
	it('continues without user when no token is provided', async () => {
		const req = { headers: {} } as Request;
		await optionalAuthenticate(req, mockRes(), next);
		expect(next).toHaveBeenCalled();
		expect(req.user).toBeUndefined();
	});

	it('continues without user when session is missing but token verifies', async () => {
		const token = jwt.sign({ sub: 'x' }, process.env.JWT_SECRET!, {
			audience: AUTH_TOKEN_AUDIENCE,
			issuer: AUTH_TOKEN_ISSUER,
		});
		const req = { headers: { authorization: `Bearer ${token}` } } as Request;
		(Session.findOne as jest.Mock).mockReturnValue({
			exec: jest.fn().mockResolvedValue(null),
		});
		await optionalAuthenticate(req, mockRes(), next);
		expect(next).toHaveBeenCalled();
		expect(req.user).toBeUndefined();
	});

	it('attaches user when session and user exist', async () => {
		const token = jwt.sign({ sub: 'x' }, process.env.JWT_SECRET!, {
			audience: AUTH_TOKEN_AUDIENCE,
			issuer: AUTH_TOKEN_ISSUER,
		});
		const req = { headers: { authorization: `Bearer ${token}` } } as Request;
		(Session.findOne as jest.Mock).mockReturnValue({
			exec: jest.fn().mockResolvedValue({ user: '507f1f77bcf86cd799439011' }),
		});
		(User.findById as jest.Mock).mockReturnValue({
			select: () => ({
				exec: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', role: 'player' }),
			}),
		});
		await optionalAuthenticate(req, mockRes(), next);
		expect(next).toHaveBeenCalled();
		expect(req.user).toBeDefined();
	});
});
