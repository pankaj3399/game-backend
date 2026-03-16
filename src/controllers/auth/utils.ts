import type { Request, Response } from 'express';
import { logger } from '../../lib/logger';
import { createAuthToken, setAuthCookie } from '../../lib/jwtAuth';

export const AUTH_CALLBACK_PATH = '/auth/callback';

/** True if user has completed signup (alias and name are required). */
export function isSignupComplete(user: { alias?: string | null; name?: string | null }): boolean {
	return !!(user.alias && user.name);
}

export interface ErrorRedirectOptions {
	kind?: string;
	errorMessage?: string;
}

/** Builds redirect URL to frontend auth callback with error params. */
export function getErrorRedirect(kind?: string, options?: ErrorRedirectOptions): string {
	const opts = options ?? {};
	const error = opts.kind ?? kind ?? 'true';
	const params = new URLSearchParams({ error });

	if (opts.errorMessage) {
		params.set('errorMessage', opts.errorMessage);
	}

	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?${params.toString()}`;
}

/** Builds redirect URL to frontend auth callback with success. */
export function getSuccessRedirect(): string {
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?${new URLSearchParams({ success: 'true' }).toString()}`;
}

/**
 * Builds redirect URL to frontend auth callback with signup pending token.
 * Uses query params (not fragment) because fragments are often stripped during OAuth redirect chains
 * (Apple -> backend -> frontend), causing users to land on /login without the token.
 * Token is short-lived (15min) and we navigate away immediately after storing it.
 */
export function getSignupRedirect(pendingToken: string): string {
	const params = new URLSearchParams({ signup: 'true', pendingToken });
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?${params.toString()}`;
}

/** Creates JWT + Session, sets auth cookie, and redirects to success URL. */
export async function loginAndRedirect(req: Request, res: Response, user: Express.User): Promise<void> {
	try {
		const token = await createAuthToken(user);
		setAuthCookie(res, token);
		res.redirect(getSuccessRedirect());
	} catch (err) {
		logger.error('Error in loginAndRedirect', { err });
		res.redirect(getErrorRedirect('session', { errorMessage: 'Failed to create an authenticated session' }));
	}
}
