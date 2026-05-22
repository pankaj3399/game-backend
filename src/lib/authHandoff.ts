import crypto from 'crypto';

const HANDOFF_TTL_MS = 2 * 60 * 1000;

type HandoffEntry = {
	token: string;
	expiresAt: number;
};

const handoffStore = new Map<string, HandoffEntry>();

function purgeExpiredHandoffs(): void {
	const now = Date.now();
	for (const [code, entry] of handoffStore) {
		if (entry.expiresAt <= now) {
			handoffStore.delete(code);
		}
	}
}

/** Creates a one-time handoff code mapped to an existing session JWT (never put JWT in URLs). */
export function createHandoffCode(authToken: string): string {
	purgeExpiredHandoffs();
	const code = crypto.randomBytes(24).toString('base64url');
	handoffStore.set(code, {
		token: authToken,
		expiresAt: Date.now() + HANDOFF_TTL_MS,
	});
	return code;
}

/** Validates and consumes a handoff code; returns the session JWT or null. */
export function consumeHandoffCode(code: string): string | null {
	purgeExpiredHandoffs();
	const entry = handoffStore.get(code);
	if (!entry) {
		return null;
	}
	handoffStore.delete(code);
	if (entry.expiresAt <= Date.now()) {
		return null;
	}
	return entry.token;
}
