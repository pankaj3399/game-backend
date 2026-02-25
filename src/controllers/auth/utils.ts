import type { Request, Response } from 'express';
import { logger } from '../../lib/logger';
import { createAuthToken, setAuthCookie } from '../../lib/jwtAuth';
import type { UserDocument } from '../../models/User';

export const AUTH_CALLBACK_PATH = '/auth/callback';

/** True if user has completed signup (alias and name are required). */
export function isSignupComplete(user: Express.User): boolean {
	return !!(user.alias && user.name);
}

/** Builds redirect URL to frontend auth callback with error param. */
export function getErrorRedirect(kind?: string): string {
	const error = encodeURIComponent(kind || 'true');
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?error=${error}`;
}

/** Builds redirect URL to frontend auth callback with success. */
export function getSuccessRedirect(): string {
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?success=true`;
}

/**
 * Builds redirect URL to frontend auth callback with signup pending token.
 * Token is in the URL fragment (#) so it is never sent to the server (no referrer, logs, or analytics).
 */
export function getSignupRedirect(pendingToken: string): string {
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}#signup=true&pendingToken=${encodeURIComponent(pendingToken)}`;
}

/** Creates JWT + Session, sets auth cookie, and redirects to success URL. */
export async function loginAndRedirect(req: Request, res: Response, user: Express.User): Promise<void> {
	try {
		const token = await createAuthToken(user as UserDocument);
		setAuthCookie(res, token);
		res.redirect(getSuccessRedirect());
	} catch (err) {
		logger.error('Error in loginAndRedirect', { err });
		res.redirect(getErrorRedirect());
	}
}
