import type { NextFunction, Request, Response } from 'express';

function testUser(role: string): Express.User {
	return {
		_id: {
			toString: () => '64b000000000000000000001',
		},
		role,
		adminOf: [],
		organizerOf: [],
		favoriteClubs: [],
		homeClub: null,
	} as unknown as Express.User;
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
