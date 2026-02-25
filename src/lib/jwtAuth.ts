import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import User, { type UserDocument } from '../models/User';
import UserAuth from '../models/UserAuth';
import Session from '../models/Session';
import { cookieSameSite, isProd } from './config';
import { logger } from './logger';

export const AUTH_COOKIE_NAME = 'auth_token';
const JWT_EXPIRY = '7d';

function getJwtSecret(): string {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error('JWT_SECRET environment variable is required');
	return secret;
}

/** Creates a JWT for the user and stores the session in DB. Uses hmacKey in payload (like backup-branch). */
export async function createAuthToken(user: UserDocument): Promise<string> {
	const userAuth = await UserAuth.findOne({ user: user._id }).exec();
	if (!userAuth) throw new Error('UserAuth not found for user');
	const token = jwt.sign(
		{ userId: userAuth.hmacKey },
		getJwtSecret(),
		{ expiresIn: JWT_EXPIRY }
	);
	await Session.create({ token, user: user._id });
	return token;
}

/** Sets the auth cookie with the JWT. */
export function setAuthCookie(res: Response, token: string): void {
	res.cookie(AUTH_COOKIE_NAME, token, {
		httpOnly: true,
		secure: cookieSameSite === 'none' || isProd,
		sameSite: cookieSameSite,
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
		path: '/'
	});
}

/** Clears the auth cookie. */
export function clearAuthCookie(res: Response): void {
	res.clearCookie(AUTH_COOKIE_NAME, {
		path: '/',
		httpOnly: true,
		secure: cookieSameSite === 'none' || isProd,
		sameSite: cookieSameSite
	});
}

/** Extracts JWT from cookie or Authorization Bearer header. */
export function extractAuthToken(req: Request): string | null {
	const fromCookie = req.cookies?.[AUTH_COOKIE_NAME];
	if (fromCookie && typeof fromCookie === 'string') return fromCookie;

	const authHeader = req.headers['authorization'];
	if (authHeader && typeof authHeader === 'string') {
		const [bearer, token] = authHeader.split(' ');
		if (bearer?.toLowerCase() === 'bearer' && token) return token;
	}
	return null;
}
