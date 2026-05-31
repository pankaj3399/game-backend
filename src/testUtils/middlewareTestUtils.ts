import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../constants/roles';
import { createTestUser } from './createTestUser';

export type TestRequestOptions = {
	user?: Express.User;
	headers?: Request['headers'];
	cookies?: Request['cookies'];
	method?: Request['method'];
	originalUrl?: Request['originalUrl'];
	ip?: Request['ip'];
};

export type TestResponse = Response & {
	statusCode: number | null;
	body: unknown;
};

export function makeUser(
	role: Role,
	overrides: Partial<Express.User> = {},
): Express.User {
	return createTestUser({ role, ...overrides });
}

export function makeReq(options: TestRequestOptions = {}): Request {
	const req: Partial<Request> = {
		headers: options.headers ?? {},
		cookies: options.cookies ?? {},
		method: options.method ?? 'GET',
		originalUrl: options.originalUrl ?? '/test',
		ip: options.ip ?? '127.0.0.1',
	};

	if (options.user) {
		req.user = options.user;
	}

	return req as Request;
}

export function makeRes(): TestResponse {
	const res = {
		statusCode: null,
		body: undefined,
		status: jest.fn((code: number) => {
			res.statusCode = code;
			return res;
		}),
		json: jest.fn((body: unknown) => {
			res.body = body;
			return res;
		}),
	} as unknown as TestResponse;

	return res;
}

export function makeNext(): jest.MockedFunction<NextFunction> {
	return jest.fn();
}
