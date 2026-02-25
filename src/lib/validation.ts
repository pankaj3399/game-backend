import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';

/**
 * Express middleware that validates req.body against a Zod schema.
 * On success: assigns parsed data to req.body and calls next().
 * On failure: responds with 400 and formatted error messages.
 */
export function validateBody<T extends z.ZodType>(schema: T) {
	return (req: Request, res: Response, next: NextFunction) => {
		const result = schema.safeParse(req.body);
		if (result.success) {
			req.body = result.data;
			next();
			return;
		}
		const messages = result.error.issues
			.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
			.join('; ');
		res.status(400).json({
			message: messages || 'Validation failed',
			error: true,
			code: 'VALIDATION_ERROR',
			details: result.error.issues
		});
	};
}
