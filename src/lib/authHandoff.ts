import crypto from 'crypto';
import { AuthHandoff, HANDOFF_TTL_SECONDS } from '../models/AuthHandoff';

const HANDOFF_TTL_MS = HANDOFF_TTL_SECONDS * 1000;

/** Creates a one-time handoff code mapped to an existing session JWT (never put JWT in URLs). */
export async function createHandoffCode(authToken: string): Promise<string> {
	const code = crypto.randomBytes(24).toString('base64url');
	const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
	await AuthHandoff.create({ code, token: authToken, expiresAt });
	return code;
}

/** Validates and atomically consumes a handoff code; returns the session JWT or null. */
export async function consumeHandoffCode(code: string): Promise<string | null> {
	const doc = await AuthHandoff.findOneAndDelete({
		code,
		expiresAt: { $gt: new Date() },
	}).lean();
	return doc?.token ?? null;
}
