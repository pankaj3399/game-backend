import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Session from '../../models/Session';
import type { IUser } from '../../models/User';

const JWT_SECRET = process.env.JWT_SECRET as string;
const EXPIRES_IN = '7d';

/**
 * Creates a JWT, saves a session for the user, and returns the token.
 * Preserves existing behavior (userId in payload = hmacKey).
 */
export async function createTokenAndSession(
	userId: mongoose.Types.ObjectId,
	hmacKey: string
): Promise<string> {
	const token = jwt.sign({ userId: hmacKey }, JWT_SECRET, { expiresIn: EXPIRES_IN });
	const session = new Session({ token, user: userId });
	await session.save();
	return token;
}

/** True if user has completed signup (at least alias, name, dateOfBirth, or gender set). */
export function isSignupComplete(user: IUser): boolean {
	return !!(user?.alias || user?.name || user?.dateOfBirth != null || user?.gender != null);
}
