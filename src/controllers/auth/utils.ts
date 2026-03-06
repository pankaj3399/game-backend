import type { Request, Response } from 'express';
import { logger } from '../../lib/logger';
import { createAuthToken, setAuthCookie } from '../../lib/jwtAuth';
import type { UserDocument } from '../../models/User';

export const AUTH_CALLBACK_PATH = '/auth/callback';

/** True if user has completed signup (alias and name are required). */
export function isSignupComplete(user: Express.User): boolean {
	return !!(user.alias && user.name);
}

/** Returns Apple payload as-is for debugging (no redaction). */
export function sanitizeApplePayload(body: Record<string, unknown> | null | undefined): Record<string, unknown> {
	if (!body || typeof body !== 'object') return {};
	return { ...body };
}

/** Renders HTML debug page with error and Apple payload (no redirect). */
export function renderAppleErrorPage(
	res: Response,
	errorMessage: string,
	applePayload: Record<string, unknown>,
	kind = 'error'
): void {
	const payloadJson = JSON.stringify(applePayload, null, 2);
	const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Apple Auth Debug</title></head>
<body style="font-family: monospace; max-width: 900px; margin: 2rem auto; padding: 1rem; background: #1e1e1e; color: #d4d4d4;">
  <h1 style="color: #f48771;">Apple Auth Error</h1>
  <p><strong>Kind:</strong> ${escapeHtml(kind)}</p>
  <p><strong>Error:</strong></p>
  <pre style="background: #2d2d2d; padding: 1rem; overflow: auto; white-space: pre-wrap;">${escapeHtml(errorMessage)}</pre>
  <p><strong>Apple Payload:</strong></p>
  <pre style="background: #2d2d2d; padding: 1rem; overflow: auto; white-space: pre-wrap;">${escapeHtml(payloadJson)}</pre>
</body>
</html>`;
	res.status(500).setHeader('Content-Type', 'text/html').send(html);
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export interface ErrorRedirectOptions {
	kind?: string;
	errorMessage?: string;
	applePayload?: Record<string, unknown>;
}

/** Builds redirect URL to frontend auth callback with error params. */
export function getErrorRedirect(kind?: string, options?: ErrorRedirectOptions): string {
	const opts = options ?? {};
	const error = encodeURIComponent(opts.kind ?? kind ?? 'true');
	const params = new URLSearchParams({ error });

	if (opts.errorMessage) {
		params.set('errorMessage', opts.errorMessage);
	}
	if (opts.applePayload && Object.keys(opts.applePayload).length > 0) {
		try {
			params.set('applePayload', Buffer.from(JSON.stringify(opts.applePayload)).toString('base64url'));
		} catch {
			// omit if serialization fails
		}
	}

	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?${params.toString()}`;
}

/** Builds redirect URL to frontend auth callback with success. */
export function getSuccessRedirect(): string {
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?success=true`;
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
		const token = await createAuthToken(user as UserDocument);
		setAuthCookie(res, token);
		res.redirect(getSuccessRedirect());
	} catch (err) {
		logger.error('Error in loginAndRedirect', { err });
		res.redirect(getErrorRedirect());
	}
}
