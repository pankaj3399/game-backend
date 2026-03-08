import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { type UserDocument } from '../models/User';
import UserAuth from '../models/UserAuth';
import Session from '../models/Session';
import { cookieSameSite, isProd } from './config';

export const AUTH_COOKIE_NAME = 'auth_token';
const JWT_EXPIRY = '7d';
export const AUTH_TOKEN_AUDIENCE = 'auth-session';
export const AUTH_TOKEN_ISSUER = 'auth-service';

function getJwtSecret(): string {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error('JWT_SECRET environment variable is required');
	return secret;
}

export function hashSessionToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

function getTokenExpiryDate(token: string): Date {
	const decoded = jwt.decode(token);
	if (!decoded || typeof decoded === 'string' || typeof decoded.exp !== 'number') {
		throw new Error('Auth token is missing an expiration timestamp');
	}

	return new Date(decoded.exp * 1000);
}

/** Creates a JWT for the user and stores a hashed session token in DB. */
export async function createAuthToken(user: UserDocument): Promise<string> {
	const userAuth = await UserAuth.findOne({ user: user._id }).exec();
	if (!userAuth) throw new Error('UserAuth not found for user');
	const token = jwt.sign(
		{ userId: userAuth.hmacKey },
		getJwtSecret(),
		{
			expiresIn: JWT_EXPIRY,
			audience: AUTH_TOKEN_AUDIENCE,
			issuer: AUTH_TOKEN_ISSUER,
			subject: user._id.toString(),
		}
	);
	await Session.create({
		tokenHash: hashSessionToken(token),
		user: user._id,
		expireAt: getTokenExpiryDate(token),
	});
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
