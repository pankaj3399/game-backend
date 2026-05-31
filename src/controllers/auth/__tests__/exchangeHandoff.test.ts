import type { Request, Response } from 'express';
import { exchangeAuthHandoff } from '../exchangeHandoff';
import { consumeHandoffCode } from '../../../lib/authHandoff';
import { setAuthCookie } from '../../../lib/jwtAuth';

jest.mock('../../../lib/authHandoff');
jest.mock('../../../lib/jwtAuth');
jest.mock('../../../lib/logger', () => ({ logger: { error: jest.fn() } }));

const mockConsume = consumeHandoffCode as jest.MockedFunction<typeof consumeHandoffCode>;
const mockSetCookie = setAuthCookie as jest.MockedFunction<typeof setAuthCookie>;

function mockRes() {
	const headers: Record<string, string> = {};
	return {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
		setHeader: jest.fn((k: string, v: string) => {
			headers[k] = v;
		}),
		_headers: headers,
	} as unknown as Response & { _headers: Record<string, string> };
}

describe('exchangeAuthHandoff', () => {
	it('returns 401 when handoff code is invalid or expired', async () => {
		mockConsume.mockResolvedValue(null);
		const res = mockRes();
		await exchangeAuthHandoff(
			{ body: { handoff: 'AbCdEfGhIjKlMnOpQrStUvWx' } } as Request,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(401);
		expect(mockSetCookie).not.toHaveBeenCalled();
	});

	it('sets auth cookie and returns token on success', async () => {
		mockConsume.mockResolvedValue('session-jwt');
		const res = mockRes();
		await exchangeAuthHandoff(
			{ body: { handoff: 'AbCdEfGhIjKlMnOpQrStUvWx' } } as Request,
			res,
		);
		expect(mockSetCookie).toHaveBeenCalledWith(res, 'session-jwt');
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ token: 'session-jwt' }),
		);
		expect(res._headers['Cache-Control']).toBe('no-store');
	});

	it('returns 400 for invalid handoff body', async () => {
		const res = mockRes();
		await exchangeAuthHandoff({ body: { handoff: 'short' } } as Request, res);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(mockConsume).not.toHaveBeenCalled();
	});
});
