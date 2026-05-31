import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import UserAuth from '../../models/UserAuth';
import Session from '../../models/Session';
import type { UserDocument } from '../../models/User';
import {
	AUTH_COOKIE_NAME,
	AUTH_TOKEN_AUDIENCE,
	AUTH_TOKEN_ISSUER,
	clearAuthCookie,
	createAuthToken,
	extractAuthToken,
	hashSessionToken,
	setAuthCookie,
} from '../jwtAuth';

jest.mock('jsonwebtoken', () => ({
	__esModule: true,
	default: {
		decode: jest.fn(),
		sign: jest.fn(),
	},
}));

jest.mock('../../models/UserAuth', () => ({
	__esModule: true,
	default: {
		findOne: jest.fn(),
	},
}));

jest.mock('../../models/Session', () => ({
	__esModule: true,
	default: {
		create: jest.fn(),
	},
}));

type CookieResponse = Response & Pick<Response, 'cookie' | 'clearCookie'>;
type ExecQuery<T> = {
	exec: jest.Mock<Promise<T>, []>;
};

const mockDecode = jest.mocked(jwt.decode);
const mockSign = jest.mocked(jwt.sign);
const mockUserAuthFindOne = jest.mocked(UserAuth.findOne);
const mockSessionCreate = jest.mocked(Session.create);

function makeRequest(input: { authorization?: string; cookieToken?: string }): Request {
	return {
		headers: input.authorization ? { authorization: input.authorization } : {},
		cookies: input.cookieToken ? { [AUTH_COOKIE_NAME]: input.cookieToken } : {},
	} as Request;
}

function makeResponse(): CookieResponse {
	return {
		cookie: jest.fn(),
		clearCookie: jest.fn(),
	} as unknown as CookieResponse;
}

function execQuery<T>(value: T): ExecQuery<T> {
	return {
		exec: jest.fn<Promise<T>, []>().mockResolvedValue(value),
	};
}

function makeUser(id: mongoose.Types.ObjectId): UserDocument {
	return { _id: id } as unknown as UserDocument;
}

describe('jwtAuth', () => {
	const previousSecret = process.env.JWT_SECRET;

	beforeEach(() => {
		process.env.JWT_SECRET = 'jwt-secret';
		jest.clearAllMocks();
	});

	afterAll(() => {
		process.env.JWT_SECRET = previousSecret;
	});

	it('hashes session tokens deterministically with sha256', () => {
		expect(hashSessionToken('token')).toBe('3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0');
		expect(hashSessionToken('token')).toBe(hashSessionToken('token'));
		expect(hashSessionToken('different')).not.toBe(hashSessionToken('token'));
	});

	it('extracts bearer tokens before falling back to auth cookies', () => {
		expect(extractAuthToken(makeRequest({ authorization: 'Bearer header-token', cookieToken: 'cookie-token' }))).toBe(
			'header-token'
		);
		expect(extractAuthToken(makeRequest({ authorization: 'bearer lower-token' }))).toBe('lower-token');
		expect(extractAuthToken(makeRequest({ authorization: 'Basic nope', cookieToken: 'cookie-token' }))).toBe(
			'cookie-token'
		);
		expect(extractAuthToken(makeRequest({}))).toBeNull();
	});

	it('sets and clears the auth cookie with secure http-only options', () => {
		const res = makeResponse();

		setAuthCookie(res, 'token-value');
		clearAuthCookie(res);

		expect(res.cookie).toHaveBeenCalledWith(
			AUTH_COOKIE_NAME,
			'token-value',
			expect.objectContaining({
				httpOnly: true,
				maxAge: 1000 * 60 * 60 * 24 * 7,
				path: '/',
			})
		);
		expect(res.clearCookie).toHaveBeenCalledWith(
			AUTH_COOKIE_NAME,
			expect.objectContaining({
				httpOnly: true,
				path: '/',
			})
		);
	});

	it('creates a signed token and stores only the hashed session token', async () => {
		const userId = new mongoose.Types.ObjectId();
		const user = makeUser(userId);
		mockUserAuthFindOne.mockReturnValue(
			execQuery({ hmacKey: 'hmac-key' }) as unknown as ReturnType<typeof UserAuth.findOne>
		);
		mockSign.mockImplementation(() => 'signed-token');
		mockDecode.mockReturnValue({ exp: 1_735_689_600 });

		await expect(createAuthToken(user)).resolves.toBe('signed-token');

		expect(mockSign).toHaveBeenCalledWith(
			{ userId: 'hmac-key' },
			'jwt-secret',
			{
				expiresIn: '7d',
				audience: AUTH_TOKEN_AUDIENCE,
				issuer: AUTH_TOKEN_ISSUER,
				subject: userId.toString(),
			}
		);
		expect(mockSessionCreate).toHaveBeenCalledWith({
			token: hashSessionToken('signed-token'),
			user: userId,
			expireAt: new Date(1_735_689_600 * 1000),
		});
	});

	it('fails token creation when auth state or expiration metadata is missing', async () => {
		const user = makeUser(new mongoose.Types.ObjectId());
		mockUserAuthFindOne.mockReturnValue(execQuery(null) as unknown as ReturnType<typeof UserAuth.findOne>);

		await expect(createAuthToken(user)).rejects.toThrow('UserAuth not found for user');

		mockUserAuthFindOne.mockReturnValue(
			execQuery({ hmacKey: 'hmac-key' }) as unknown as ReturnType<typeof UserAuth.findOne>
		);
		mockSign.mockImplementation(() => 'signed-token');
		mockDecode.mockReturnValue(null);

		await expect(createAuthToken(user)).rejects.toThrow('Auth token is missing an expiration timestamp');
	});
});
