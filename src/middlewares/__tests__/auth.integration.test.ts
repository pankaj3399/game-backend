import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Session from '../../models/Session';
import User from '../../models/User';
import { ROLES } from '../../constants/roles';
import { AUTH_TOKEN_AUDIENCE, AUTH_TOKEN_ISSUER, AUTH_COOKIE_NAME, hashSessionToken } from '../../lib/jwtAuth';
import authenticate from '../auth';
import optionalAuthenticate from '../optionalAuthenticate';
import { logger } from '../../lib/logger';
import { makeNext, makeReq, makeRes, makeUser } from '../../testUtils/middlewareTestUtils';

jest.mock('jsonwebtoken', () => ({
	__esModule: true,
	default: {
		verify: jest.fn(),
	},
}));

jest.mock('../../models/Session', () => ({
	__esModule: true,
	default: {
		findOne: jest.fn(),
	},
}));

jest.mock('../../models/User', () => ({
	__esModule: true,
	default: {
		findById: jest.fn(),
	},
}));

jest.mock('../../lib/logger', () => ({
	logger: {
		warn: jest.fn(),
	},
}));

type ExecQuery<T> = {
	exec: jest.Mock<Promise<T>, []>;
};

type SelectQuery<T> = ExecQuery<T> & {
	select: jest.Mock<ExecQuery<T>, [string]>;
};

const mockVerify = jest.mocked(jwt.verify);
const mockSessionFindOne = jest.mocked(Session.findOne);
const mockUserFindById = jest.mocked(User.findById);
const mockLoggerWarn = jest.mocked(logger.warn);

function execQuery<T>(value: T): ExecQuery<T> {
	return {
		exec: jest.fn<Promise<T>, []>().mockResolvedValue(value),
	};
}

function selectableQuery<T>(value: T): SelectQuery<T> {
	const query = {
		exec: jest.fn<Promise<T>, []>().mockResolvedValue(value),
		select: jest.fn<ExecQuery<T>, [string]>(),
	};
	query.select.mockReturnValue(query);
	return query;
}

function mockSession(value: unknown): void {
	mockSessionFindOne.mockReturnValue(execQuery(value) as unknown as ReturnType<typeof Session.findOne>);
}

function mockSessionError(error: Error): void {
	mockSessionFindOne.mockReturnValue({
		exec: jest.fn<Promise<never>, []>().mockRejectedValue(error),
	} as unknown as ReturnType<typeof Session.findOne>);
}

function mockUser(value: unknown): void {
	mockUserFindById.mockReturnValue(selectableQuery(value) as unknown as ReturnType<typeof User.findById>);
}

function mockUserError(error: Error): void {
	const query = {
		exec: jest.fn<Promise<never>, []>().mockRejectedValue(error),
		select: jest.fn<ExecQuery<never>, [string]>(),
	};
	query.select.mockReturnValue(query);
	mockUserFindById.mockReturnValue(query as unknown as ReturnType<typeof User.findById>);
}

describe('authenticate integration', () => {
	const previousSecret = process.env.JWT_SECRET;

	beforeEach(() => {
		process.env.JWT_SECRET = 'test-secret';
		jest.clearAllMocks();
		mockVerify.mockImplementation(() => undefined);
	});

	afterAll(() => {
		process.env.JWT_SECRET = previousSecret;
	});

	it('rejects requests without a bearer token or auth cookie', async () => {
		const req = makeReq();
		const res = makeRes();
		const next = makeNext();

		await authenticate(req, res, next);

		expect(res.statusCode).toBe(401);
		expect(res.body).toEqual({ message: 'Authorization required' });
		expect(next).not.toHaveBeenCalled();
		expect(mockVerify).not.toHaveBeenCalled();
	});

	it('rejects malformed bearer headers without checking the database', async () => {
		const req = makeReq({ headers: { authorization: 'Bearer' } });
		const res = makeRes();
		const next = makeNext();

		await authenticate(req, res, next);

		expect(res.statusCode).toBe(401);
		expect(res.body).toEqual({ message: 'Authorization required' });
		expect(next).not.toHaveBeenCalled();
		expect(mockVerify).not.toHaveBeenCalled();
		expect(mockSessionFindOne).not.toHaveBeenCalled();
	});

	it('rejects requests when JWT_SECRET is not configured', async () => {
		delete process.env.JWT_SECRET;
		const req = makeReq({ headers: { authorization: 'Bearer token-1' } });
		const res = makeRes();
		const next = makeNext();

		await authenticate(req, res, next);

		expect(res.statusCode).toBe(500);
		expect(res.body).toEqual({ message: 'Server configuration error' });
		expect(next).not.toHaveBeenCalled();
	});

	it('rejects invalid and expired tokens with specific auth errors', async () => {
		const cases = [
			{ name: 'JsonWebTokenError', message: 'Invalid token' },
			{ name: 'TokenExpiredError', message: 'Token expired, login again' },
		];

		for (const testCase of cases) {
			mockVerify.mockImplementationOnce(() => {
				throw Object.assign(new Error(testCase.name), { name: testCase.name });
			});
			const req = makeReq({ headers: { authorization: 'Bearer bad-token' } });
			const res = makeRes();
			const next = makeNext();

			await authenticate(req, res, next);

			expect(res.statusCode).toBe(401);
			expect(res.body).toEqual({ message: testCase.message });
			expect(next).not.toHaveBeenCalled();
		}
	});

	it('returns a generic authentication error for unexpected JWT failures', async () => {
		mockVerify.mockImplementationOnce(() => {
			throw Object.assign(new Error('issuer unavailable'), { name: 'UnexpectedJwtError' });
		});
		const req = makeReq({ headers: { authorization: 'Bearer bad-token' } });
		const res = makeRes();
		const next = makeNext();

		await authenticate(req, res, next);

		expect(res.statusCode).toBe(500);
		expect(res.body).toEqual({ message: 'Authentication error' });
		expect(next).not.toHaveBeenCalled();
	});

	it('rejects valid tokens when the session no longer exists', async () => {
		mockSession(null);
		const req = makeReq({ headers: { authorization: 'Bearer token-2' } });
		const res = makeRes();
		const next = makeNext();

		await authenticate(req, res, next);

		expect(mockVerify).toHaveBeenCalledWith('token-2', 'test-secret', {
			audience: AUTH_TOKEN_AUDIENCE,
			issuer: AUTH_TOKEN_ISSUER,
		});
		expect(mockSessionFindOne).toHaveBeenCalledWith({
			$or: [{ token: 'token-2' }, { token: hashSessionToken('token-2') }],
		});
		expect(res.statusCode).toBe(401);
		expect(res.body).toEqual({ message: 'Session expired, login again' });
		expect(next).not.toHaveBeenCalled();
	});

	it('rejects valid tokens when the session has no user reference', async () => {
		mockSession({ user: null });
		const req = makeReq({ headers: { authorization: 'Bearer token-without-user' } });
		const res = makeRes();
		const next = makeNext();

		await authenticate(req, res, next);

		expect(res.statusCode).toBe(401);
		expect(res.body).toEqual({ message: 'Session expired, login again' });
		expect(mockUserFindById).not.toHaveBeenCalled();
		expect(next).not.toHaveBeenCalled();
	});

	it('returns an authentication error when session lookup fails', async () => {
		mockSessionError(new Error('session db unavailable'));
		const req = makeReq({ headers: { authorization: 'Bearer token-session-error' } });
		const res = makeRes();
		const next = makeNext();

		await authenticate(req, res, next);

		expect(res.statusCode).toBe(500);
		expect(res.body).toEqual({ message: 'Authentication error' });
		expect(next).not.toHaveBeenCalled();
	});

	it('rejects valid sessions when the user has been removed', async () => {
		const userId = new mongoose.Types.ObjectId();
		mockSession({ user: userId });
		mockUser(null);
		const req = makeReq({ cookies: { [AUTH_COOKIE_NAME]: 'cookie-token' } });
		const res = makeRes();
		const next = makeNext();

		await authenticate(req, res, next);

		expect(mockUserFindById).toHaveBeenCalledWith(userId);
		expect(res.statusCode).toBe(401);
		expect(res.body).toEqual({ message: 'User not found, login again' });
		expect(next).not.toHaveBeenCalled();
	});

	it('returns an authentication error when user lookup fails', async () => {
		const userId = new mongoose.Types.ObjectId();
		mockSession({ user: userId });
		mockUserError(new Error('user db unavailable'));
		const req = makeReq({ headers: { authorization: 'Bearer token-user-error' } });
		const res = makeRes();
		const next = makeNext();

		await authenticate(req, res, next);

		expect(mockUserFindById).toHaveBeenCalledWith(userId);
		expect(res.statusCode).toBe(500);
		expect(res.body).toEqual({ message: 'Authentication error' });
		expect(next).not.toHaveBeenCalled();
	});

	it('attaches the session user and continues for a valid token', async () => {
		const userId = new mongoose.Types.ObjectId();
		const user = makeUser(ROLES.CLUB_ADMIN);
		mockSession({ user: userId });
		mockUser(user);
		const req = makeReq({ headers: { authorization: 'Bearer token-3' } });
		const res = makeRes();
		const next = makeNext();

		await authenticate(req, res, next);

		expect(req.user).toBe(user);
		expect(mockUserFindById).toHaveBeenCalledWith(userId);
		expect(next).toHaveBeenCalledTimes(1);
		expect(res.status).not.toHaveBeenCalled();
	});

	it('prefers a bearer token over the auth cookie when both are present', async () => {
		const userId = new mongoose.Types.ObjectId();
		const user = makeUser(ROLES.PLAYER);
		mockSession({ user: userId });
		mockUser(user);
		const req = makeReq({
			headers: { authorization: 'Bearer header-token' },
			cookies: { [AUTH_COOKIE_NAME]: 'cookie-token' },
		});
		const res = makeRes();
		const next = makeNext();

		await authenticate(req, res, next);

		expect(mockVerify).toHaveBeenCalledWith('header-token', 'test-secret', {
			audience: AUTH_TOKEN_AUDIENCE,
			issuer: AUTH_TOKEN_ISSUER,
		});
		expect(mockSessionFindOne).toHaveBeenCalledWith({
			$or: [{ token: 'header-token' }, { token: hashSessionToken('header-token') }],
		});
		expect(req.user).toBe(user);
		expect(next).toHaveBeenCalledTimes(1);
	});
});

describe('optionalAuthenticate integration', () => {
	const previousSecret = process.env.JWT_SECRET;

	beforeEach(() => {
		process.env.JWT_SECRET = 'test-secret';
		jest.clearAllMocks();
		mockVerify.mockImplementation(() => undefined);
	});

	afterAll(() => {
		process.env.JWT_SECRET = previousSecret;
	});

	it('continues as a guest when no auth token is present', async () => {
		const req = makeReq();
		const res = makeRes();
		const next = makeNext();

		await optionalAuthenticate(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
		expect(req.user).toBeUndefined();
		expect(mockVerify).not.toHaveBeenCalled();
		expect(mockSessionFindOne).not.toHaveBeenCalled();
	});

	it('continues as a guest when the bearer header is malformed and no cookie exists', async () => {
		const req = makeReq({ headers: { authorization: 'Basic token' } });
		const res = makeRes();
		const next = makeNext();

		await optionalAuthenticate(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
		expect(req.user).toBeUndefined();
		expect(mockVerify).not.toHaveBeenCalled();
		expect(mockSessionFindOne).not.toHaveBeenCalled();
		expect(res.status).not.toHaveBeenCalled();
	});

	it('returns a server configuration error when an optional token is present without a secret', async () => {
		delete process.env.JWT_SECRET;
		const req = makeReq({ headers: { authorization: 'Bearer token-4' } });
		const res = makeRes();
		const next = makeNext();

		await optionalAuthenticate(req, res, next);

		expect(res.statusCode).toBe(500);
		expect(res.body).toEqual({ message: 'Server configuration error' });
		expect(next).not.toHaveBeenCalled();
	});

	it('continues as a guest when the session or user cannot be found', async () => {
		const reqWithoutSession = makeReq({ headers: { authorization: 'Bearer token-5' } });
		const resWithoutSession = makeRes();
		const nextWithoutSession = makeNext();
		mockSession(null);

		await optionalAuthenticate(reqWithoutSession, resWithoutSession, nextWithoutSession);

		expect(nextWithoutSession).toHaveBeenCalledTimes(1);
		expect(reqWithoutSession.user).toBeUndefined();

		const userId = new mongoose.Types.ObjectId();
		const reqWithoutUser = makeReq({ headers: { authorization: 'Bearer token-6' } });
		const resWithoutUser = makeRes();
		const nextWithoutUser = makeNext();
		mockSession({ user: userId });
		mockUser(null);

		await optionalAuthenticate(reqWithoutUser, resWithoutUser, nextWithoutUser);

		expect(nextWithoutUser).toHaveBeenCalledTimes(1);
		expect(reqWithoutUser.user).toBeUndefined();
	});

	it('continues as a guest when the optional session has no user reference', async () => {
		mockSession({ user: undefined });
		const req = makeReq({ headers: { authorization: 'Bearer token-without-user' } });
		const res = makeRes();
		const next = makeNext();

		await optionalAuthenticate(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
		expect(req.user).toBeUndefined();
		expect(mockUserFindById).not.toHaveBeenCalled();
		expect(res.status).not.toHaveBeenCalled();
	});

	it('attaches the session user when optional auth succeeds', async () => {
		const userId = new mongoose.Types.ObjectId();
		const user = makeUser(ROLES.ORGANISER);
		mockSession({ user: userId });
		mockUser(user);
		const req = makeReq({ headers: { authorization: 'Bearer token-7' } });
		const res = makeRes();
		const next = makeNext();

		await optionalAuthenticate(req, res, next);

		expect(req.user).toBe(user);
		expect(next).toHaveBeenCalledTimes(1);
		expect(res.status).not.toHaveBeenCalled();
	});

	it('logs invalid optional tokens and continues as a guest', async () => {
		mockVerify.mockImplementationOnce(() => {
			throw new Error('bad token');
		});
		const req = makeReq({
			headers: { authorization: 'Bearer invalid-token' },
			method: 'POST',
			originalUrl: '/private',
			ip: '10.0.0.1',
		});
		const res = makeRes();
		const next = makeNext();

		await optionalAuthenticate(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
		expect(req.user).toBeUndefined();
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'optionalAuthenticate: invalid session, treating as guest',
			expect.objectContaining({
				method: 'POST',
				path: '/private',
				ip: '10.0.0.1',
				hasAuthHeader: true,
				message: 'bad token',
			})
		);
	});

	it('logs invalid cookie tokens without reporting an auth header', async () => {
		mockVerify.mockImplementationOnce(() => {
			throw 'cookie token failed';
		});
		const req = makeReq({
			cookies: { [AUTH_COOKIE_NAME]: 'invalid-cookie-token' },
			method: 'GET',
			originalUrl: '/public',
		});
		const res = makeRes();
		const next = makeNext();

		await optionalAuthenticate(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
		expect(req.user).toBeUndefined();
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'optionalAuthenticate: invalid session, treating as guest',
			expect.objectContaining({
				method: 'GET',
				path: '/public',
				hasAuthHeader: false,
				message: 'cookie token failed',
			})
		);
	});

	it('logs database failures and continues as a guest', async () => {
		mockSessionError(new Error('session lookup failed'));
		const req = makeReq({ headers: { authorization: 'Bearer token-db-error' } });
		const res = makeRes();
		const next = makeNext();

		await optionalAuthenticate(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
		expect(req.user).toBeUndefined();
		expect(res.status).not.toHaveBeenCalled();
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'optionalAuthenticate: invalid session, treating as guest',
			expect.objectContaining({
				hasAuthHeader: true,
				message: 'session lookup failed',
			})
		);
	});
});
