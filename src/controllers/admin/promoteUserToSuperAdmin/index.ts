import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseBodyWithSchema } from '../../../shared/validation';
import { promoteUserToSuperAdminFlow } from './handler';
import { promoteUserToSuperAdminSchema } from './validation';

export async function promoteUserToSuperAdmin(req: Request, res: Response) {
	try {
		const parsed = parseBodyWithSchema(promoteUserToSuperAdminSchema, req.body);
		if (!parsed.ok) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await promoteUserToSuperAdminFlow(parsed.data);
		if (!result.ok) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error promoting user to super_admin', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}
