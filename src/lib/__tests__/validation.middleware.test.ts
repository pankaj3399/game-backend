import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { validateBody } from '../validation';

describe('validateBody', () => {
	const schema = z.object({ name: z.string().min(1) });
	const middleware = validateBody(schema);
	let next: NextFunction;

	beforeEach(() => {
		next = jest.fn() as NextFunction;
	});

	function mockRes() {
		return {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
		} as unknown as Response;
	}

	it('assigns parsed body and calls next on success', () => {
		const req = { body: { name: 'Alice' } } as Request;
		const res = mockRes();
		middleware(req, res, next);
		expect(next).toHaveBeenCalled();
		expect(req.body).toEqual({ name: 'Alice' });
	});

	it('returns 400 with formatted issues on failure', () => {
		const req = { body: { name: '' } } as Request;
		const res = mockRes();
		middleware(req, res, next);
		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({ code: 'VALIDATION_ERROR', error: true }),
		);
		expect(next).not.toHaveBeenCalled();
	});
});
