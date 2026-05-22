import type { Request, Response } from 'express';
import { buildErrorPayload } from '../../shared/errors';
import { setAuthCookie } from '../../lib/jwtAuth';
import { consumeHandoffCode } from '../../lib/authHandoff';
import { logger } from '../../lib/logger';
import type { ExchangeHandoffInput } from '../../validation/auth.schemas';

/**
 * POST /api/auth/exchange-handoff
 * Exchanges a one-time OAuth handoff code for a session (cookie + token for PWA Bearer).
 */
export async function exchangeAuthHandoff(req: Request, res: Response): Promise<void> {
	try {
		const { handoff } = req.body as ExchangeHandoffInput;
		const token = await consumeHandoffCode(handoff);
		if (!token) {
			res.status(401).json(buildErrorPayload('Invalid or expired handoff code'));
			return;
		}

		setAuthCookie(res, token);
		res.setHeader('Cache-Control', 'no-store');
		res.setHeader('Pragma', 'no-cache');
		res.status(200).json({
			message: 'Handoff exchanged successfully',
			token,
		});
	} catch (err: unknown) {
		logger.error('Error exchanging auth handoff', { err });
		res.status(500).json(buildErrorPayload('Failed to exchange handoff code'));
	}
}
