import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error('JWT_SECRET environment variable is required');
	return secret;
}

const PENDING_SIGNUP_AUD = 'pending-signup';
const PENDING_SIGNUP_ISSUER = 'auth-service-pending-signup';

export interface PendingSignupPayload {
	pendingEmail: string;
	pendingSignup: true;
	appleId?: string;
	googleId?: string;
	/** When true, frontend should show editable email field (Apple user with placeholder). */
	requiresEmailInput?: boolean;
}

/** Creates a short-lived JWT for the complete-signup flow. */
export function createPendingSignupToken(payload: Omit<PendingSignupPayload, 'pendingSignup'>): string {
	return jwt.sign(
		{ ...payload, pendingSignup: true as const },
		getJwtSecret(),
		{ expiresIn: '15m', audience: PENDING_SIGNUP_AUD, issuer: PENDING_SIGNUP_ISSUER }
	);
}

function isPendingSignupPayload(decoded: unknown): decoded is PendingSignupPayload {
	if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) return false;
	const ps = (decoded as Record<string, unknown>).pendingSignup;
	const pe = (decoded as Record<string, unknown>).pendingEmail;
	if (ps !== true || typeof pe !== 'string') return false;
	const ai = (decoded as Record<string, unknown>).appleId;
	const gi = (decoded as Record<string, unknown>).googleId;
	const rei = (decoded as Record<string, unknown>).requiresEmailInput;
	return (
		(ai === undefined || typeof ai === 'string') &&
		(gi === undefined || typeof gi === 'string') &&
		(rei === undefined || typeof rei === 'boolean')
	);
}

/** Verifies and decodes the pending signup token. */
export function verifyPendingSignupToken(token: string): PendingSignupPayload {
	const decoded = jwt.verify(token, getJwtSecret(), {
		audience: PENDING_SIGNUP_AUD,
		issuer: PENDING_SIGNUP_ISSUER
	});
	if (!isPendingSignupPayload(decoded)) {
		throw new Error('Invalid pending signup token');
	}
	return decoded;
}
