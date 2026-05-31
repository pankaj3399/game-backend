/**
 * Unit tests for completeSignUp — mocks User, UserAuth, session, and pending token verification.
 */

import mongoose, { Types } from 'mongoose';
import type { Request, Response } from 'express';
import User from '../../../models/User';
import UserAuth from '../../../models/UserAuth';
import { completeSignUp } from '../completeSignUp';
import { verifyPendingSignupToken } from '../pendingToken';
import { createAuthToken, setAuthCookie } from '../../../lib/jwtAuth';

jest.mock('mongoose', () => {
	const actual = jest.requireActual<typeof mongoose>('mongoose');
	return { ...actual, startSession: jest.fn() };
});

jest.mock('../../../models/User');
jest.mock('../../../models/UserAuth');
jest.mock('../pendingToken');
jest.mock('../../../lib/jwtAuth');
jest.mock('../../../lib/passport', () => ({
	isApplePlaceholderEmail: jest.fn().mockReturnValue(false),
}));
jest.mock('../../../lib/logger', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
	LogError: jest.fn(),
}));

const mockStartSession = mongoose.startSession as jest.MockedFunction<typeof mongoose.startSession>;
const mockVerifyToken = verifyPendingSignupToken as jest.MockedFunction<typeof verifyPendingSignupToken>;
const mockCreateAuthToken = createAuthToken as jest.MockedFunction<typeof createAuthToken>;

const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439011');

function txSession(handler: (cb: () => Promise<unknown>) => Promise<unknown>) {
	return {
		withTransaction: handler,
		endSession: jest.fn().mockResolvedValue(undefined),
	} as unknown as mongoose.ClientSession;
}

function makeRes(): Response {
	const res = {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response;
	return res;
}

function makeReq(body: Record<string, unknown>): Request {
	return { body, originalUrl: '/auth/complete-signup' } as Request;
}

function userFindByIdChain(user: unknown) {
	return {
		setOptions: () => ({
			session: () => Promise.resolve(user),
		}),
	};
}

function userFindOneChain(user: unknown) {
	return {
		setOptions: () => ({
			session: () => Promise.resolve(user),
		}),
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	mockStartSession.mockResolvedValue(txSession((cb) => cb()) as unknown as mongoose.ClientSession);
	mockCreateAuthToken.mockResolvedValue('jwt-token');
	(setAuthCookie as jest.Mock).mockImplementation(() => undefined);
});

describe('completeSignUp', () => {
	it('returns 400 when body fails validation', async () => {
		const res = makeRes();
		await completeSignUp(makeReq({}), res);
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('returns 404 when pending token resolves but user is missing', async () => {
		mockVerifyToken.mockReturnValue({ pendingEmail: 'new@example.com' });
		(User.findOne as jest.Mock).mockReturnValue(userFindOneChain(null));

		const res = makeRes();
		await completeSignUp(
			makeReq({
				pendingToken: 'token',
				alias: 'player1',
				name: 'Player One',
			}),
			res,
		);

		expect(res.status).toHaveBeenCalledWith(404);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ code: 'NO_USER_FOUND' }),
		);
	});

	it('returns 200 with token when signup is already complete (idempotent)', async () => {
		const completeUser = {
			_id: USER_ID,
			alias: 'player1',
			name: 'Player One',
			deletedAt: null,
		};
		mockVerifyToken.mockReturnValue({ pendingEmail: 'done@example.com' });
		(User.findOne as jest.Mock).mockReturnValue(userFindOneChain(completeUser));

		const res = makeRes();
		await completeSignUp(
			makeReq({
				pendingToken: 'token',
				alias: 'player1',
				name: 'Player One',
			}),
			res,
		);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ code: 'SIGNUP_SUCCESSFUL', token: 'jwt-token' }),
		);
		expect(mockCreateAuthToken).toHaveBeenCalledWith(completeUser);
	});

	it('returns 400 for invalid pending token', async () => {
		mockVerifyToken.mockImplementation(() => {
			const err = new Error('Invalid pending signup token');
			err.name = 'JsonWebTokenError';
			throw err;
		});

		const res = makeRes();
		await completeSignUp(
			makeReq({
				pendingToken: 'bad',
				alias: 'player1',
				name: 'Player One',
			}),
			res,
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ code: 'INVALID_TOKEN' }),
		);
	});

	it('completes email signup and sets auth cookie', async () => {
		const incompleteUser = {
			_id: USER_ID,
			alias: null,
			name: null,
			deletedAt: null,
		};
		const completedUser = {
			_id: USER_ID,
			alias: 'player1',
			name: 'Player One',
			deletedAt: null,
		};

		mockVerifyToken.mockReturnValue({ pendingEmail: 'new@example.com' });
		(User.findOne as jest.Mock).mockReturnValue(userFindOneChain(incompleteUser));
		(User.findByIdAndUpdate as jest.Mock).mockReturnValue({
			setOptions: () => ({
				exec: () => Promise.resolve(completedUser),
			}),
		});

		const res = makeRes();
		await completeSignUp(
			makeReq({
				pendingToken: 'token',
				alias: 'player1',
				name: 'Player One',
			}),
			res,
		);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(setAuthCookie).toHaveBeenCalledWith(res, 'jwt-token');
	});
});
