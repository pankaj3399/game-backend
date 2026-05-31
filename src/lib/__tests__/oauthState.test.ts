import type { Request, Response } from 'express';
import { createOAuthStateStore } from '../oauthState';

function mockReqRes(cookieValue?: string) {
	const cookies: Record<string, string> = {};
	if (cookieValue) {
		cookies.__oauth_state_google = cookieValue;
	}
	const res = {
		cookie: jest.fn((name: string, value: string) => {
			cookies[name] = value;
		}),
		clearCookie: jest.fn(),
	} as unknown as Response;
	const req = {
		cookies,
		headers: { host: 'localhost:3000' },
		secure: false,
		res,
	} as unknown as Request;
	return { req, res, cookies };
}

describe('createOAuthStateStore', () => {
	it('stores hashed state in cookie and returns token to callback', async () => {
		const store = createOAuthStateStore('google');
		const { req, res } = mockReqRes();
		const callback = jest.fn();

		store.store(req, undefined, undefined, undefined, callback);

		expect(callback).toHaveBeenCalledWith(null, expect.any(String));
		expect(res.cookie).toHaveBeenCalledWith(
			'__oauth_state_google',
			expect.any(String),
			expect.objectContaining({ httpOnly: true }),
		);
	});

	it('verify succeeds when cookie hash matches provided state', async () => {
		const googleStore = createOAuthStateStore('google');
		const { req, res } = mockReqRes();
		let stateToken = '';
		await new Promise<void>((resolve) => {
			googleStore.store(req, undefined, undefined, undefined, (_err, token) => {
				stateToken = token ?? '';
				resolve();
			});
		});
		const cookieHash = (req.cookies as Record<string, string>).__oauth_state_google;
		const verifyReq = {
			...req,
			cookies: { __oauth_state_google: cookieHash },
			res,
		} as Request;
		const verifyCb = jest.fn();

		googleStore.verify(verifyReq, stateToken, undefined, verifyCb);

		expect(verifyCb).toHaveBeenCalledWith(null, true, expect.any(Object));
	});

	it('verify fails when cookie is missing', async () => {
		const store = createOAuthStateStore('apple');
		const { req, res } = mockReqRes();
		const verifyCb = jest.fn();

		store.verify(req, 'any-token', undefined, verifyCb);

		expect(verifyCb).toHaveBeenCalledWith(
			null,
			false,
			expect.objectContaining({ message: expect.stringMatching(/missing or expired/i) }),
		);
	});
});
