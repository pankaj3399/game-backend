const AUTH_CALLBACK_PATH = '/auth/callback';

/** True if user has completed signup (alias and name are required). */
export function isSignupComplete(user: Express.User): boolean {
	return !!(user.alias && user.name);
}

/** Builds redirect URL to frontend auth callback with error param. */
export function getErrorRedirect(kind?: string): string {
	const error = kind || 'true';
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?error=${error}`;
}

/** Builds redirect URL to frontend auth callback with success. */
export function getSuccessRedirect(): string {
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?success=true`;
}

/** Builds redirect URL to frontend auth callback with signup pending token. */
export function getSignupRedirect(pendingToken: string): string {
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?signup=true&pendingToken=${encodeURIComponent(pendingToken)}`;
}
