import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error('JWT_SECRET environment variable is required');
	return secret;
}

export interface PendingSignupPayload {
	pendingEmail: string;
	pendingSignup: true;
	appleId?: string;
	googleId?: string;
}

/** Creates a short-lived JWT for the complete-signup flow. */
export function createPendingSignupToken(payload: Omit<PendingSignupPayload, 'pendingSignup'>): string {
	return jwt.sign(
		{ ...payload, pendingSignup: true as const },
		getJwtSecret(),
		{ expiresIn: '15m' }
	);
}

/** Verifies and decodes the pending signup token. */
export function verifyPendingSignupToken(token: string): PendingSignupPayload {
	const decoded = jwt.verify(token, getJwtSecret()) as unknown as PendingSignupPayload;
	if (!decoded.pendingSignup || !decoded.pendingEmail) {
		throw new Error('Invalid pending signup token');
	}
	return decoded;
}
