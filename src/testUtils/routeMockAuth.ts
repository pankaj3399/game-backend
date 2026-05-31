import type { NextFunction, Request, Response } from 'express';
import { createTestUser } from './createTestUser';

function testUser(role: string): Express.User {
	return createTestUser({ role: role as Express.User['role'] });
}

export function attachTestUser(req: Request, res: Response, next: NextFunction): void {
	const role = req.header('x-test-role');
	if (!role) {
		res.status(401).json({ message: 'Authorization required' });
		return;
	}

	req.user = testUser(role);
	next();
}

export function optionallyAttachTestUser(req: Request, _res: Response, next: NextFunction): void {
	const role = req.header('x-test-role');
	if (role) {
		req.user = testUser(role);
	}
	next();
}
