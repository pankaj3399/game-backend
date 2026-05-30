import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express } from 'express';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { ROLES } from '../../constants/roles';
import { AUTH_COOKIE_NAME, AUTH_TOKEN_AUDIENCE, AUTH_TOKEN_ISSUER, hashSessionToken } from '../../lib/jwtAuth';
import { logger } from '../../lib/logger';
import Session from '../../models/Session';
import User from '../../models/User';
import { makeUser } from '../../testUtils/middlewareTestUtils';
import authenticate from '../auth';
import optionalAuthenticate from '../optionalAuthenticate';
import { requireExactRoles, requireOrganiserOrAbove } from '../rbac';

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

type HttpResult = {
	status: number;
	body: unknown | null;
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

function mockUser(role: (typeof ROLES)[keyof typeof ROLES]): Express.User {
	const user = makeUser(role);
	mockUserFindById.mockReturnValue(selectableQuery(user) as unknown as ReturnType<typeof User.findById>);
	return user;
}

function buildApp(): Express {
	const app = express();
	app.use(cookieParser());

	app.get('/organiser', authenticate, requireOrganiserOrAbove, (req, res) => {
		res.status(200).json({ access: 'organiser', role: req.user?.role });
	});

	app.get('/organiser-exact', authenticate, requireExactRoles(ROLES.ORGANISER), (req, res) => {
		res.status(200).json({ access: 'organiser-exact', role: req.user?.role });
	});

	app.get('/optional', optionalAuthenticate, (req, res) => {
		res.status(200).json({
			authenticated: Boolean(req.user),
			role: req.user?.role ?? null,
		});
	});

	return app;
}

async function request(app: Express, path: string, init: RequestInit = {}): Promise<HttpResult> {
	const server = await new Promise<Server>((resolve) => {
		const listeningServer = app.listen(0, () => resolve(listeningServer));
	});
	const address = server.address();
	if (!address || typeof address === 'string') {
		server.close();
		throw new Error('Test server did not bind to a TCP port');
	}

	try {
		const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init);
		const text = await response.text();
		return {
			status: response.status,
			body: text ? JSON.parse(text) : null,
		};
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	}
}

describe('auth + RBAC middleware pipeline integration', () => {
	const previousSecret = process.env.JWT_SECRET;

	beforeEach(() => {
		process.env.JWT_SECRET = 'test-secret';
		jest.clearAllMocks();
		mockVerify.mockImplementation(() => undefined);
	});

	afterAll(() => {
		process.env.JWT_SECRET = previousSecret;
	});

	it('authenticates a bearer token and allows an organiser-level route', async () => {
		const userId = new mongoose.Types.ObjectId();
		mockSession({ user: userId });
		mockUser(ROLES.ORGANISER);

		const result = await request(buildApp(), '/organiser', {
			headers: { authorization: 'Bearer organiser-token' },
		});

		expect(result).toEqual({
			status: 200,
			body: { access: 'organiser', role: ROLES.ORGANISER },
		});
		expect(mockVerify).toHaveBeenCalledWith('organiser-token', 'test-secret', {
			audience: AUTH_TOKEN_AUDIENCE,
			issuer: AUTH_TOKEN_ISSUER,
		});
		expect(mockSessionFindOne).toHaveBeenCalledWith({
			$or: [{ token: 'organiser-token' }, { token: hashSessionToken('organiser-token') }],
		});
		expect(mockUserFindById).toHaveBeenCalledWith(userId);
	});

	it('stops unauthenticated requests before RBAC runs', async () => {
		const result = await request(buildApp(), '/organiser');

		expect(result).toEqual({
			status: 401,
			body: { message: 'Authorization required' },
		});
		expect(mockVerify).not.toHaveBeenCalled();
		expect(mockSessionFindOne).not.toHaveBeenCalled();
		expect(mockUserFindById).not.toHaveBeenCalled();
	});

	it('authenticates first and then returns RBAC 403 for a player', async () => {
		mockSession({ user: new mongoose.Types.ObjectId() });
		mockUser(ROLES.PLAYER);

		const result = await request(buildApp(), '/organiser', {
			headers: { authorization: 'Bearer player-token' },
		});

		expect(result).toEqual({
			status: 403,
			body: {
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
			},
		});
		expect(mockVerify).toHaveBeenCalledTimes(1);
		expect(mockUserFindById).toHaveBeenCalledTimes(1);
	});

	it('does not let a higher role through an exact-role route', async () => {
		mockSession({ user: new mongoose.Types.ObjectId() });
		mockUser(ROLES.SUPER_ADMIN);

		const result = await request(buildApp(), '/organiser-exact', {
			headers: { authorization: 'Bearer super-admin-token' },
		});

		expect(result).toEqual({
			status: 403,
			body: {
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
			},
		});
	});

	it('lets optional routes continue as guests when no token is present', async () => {
		const result = await request(buildApp(), '/optional');

		expect(result).toEqual({
			status: 200,
			body: { authenticated: false, role: null },
		});
		expect(mockVerify).not.toHaveBeenCalled();
		expect(mockSessionFindOne).not.toHaveBeenCalled();
	});

	it('attaches a cookie-authenticated user on optional routes', async () => {
		mockSession({ user: new mongoose.Types.ObjectId() });
		mockUser(ROLES.CLUB_ADMIN);

		const result = await request(buildApp(), '/optional', {
			headers: { cookie: `${AUTH_COOKIE_NAME}=club-cookie-token` },
		});

		expect(result).toEqual({
			status: 200,
			body: { authenticated: true, role: ROLES.CLUB_ADMIN },
		});
		expect(mockVerify).toHaveBeenCalledWith('club-cookie-token', 'test-secret', {
			audience: AUTH_TOKEN_AUDIENCE,
			issuer: AUTH_TOKEN_ISSUER,
		});
	});

	it('logs invalid optional tokens and still returns the guest route response', async () => {
		mockVerify.mockImplementationOnce(() => {
			throw new Error('invalid optional pipeline token');
		});

		const result = await request(buildApp(), '/optional', {
			headers: { authorization: 'Bearer invalid-optional-token' },
		});

		expect(result).toEqual({
			status: 200,
			body: { authenticated: false, role: null },
		});
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			'optionalAuthenticate: invalid session, treating as guest',
			expect.objectContaining({
				method: 'GET',
				path: '/optional',
				hasAuthHeader: true,
				message: 'invalid optional pipeline token',
			})
		);
	});
});
