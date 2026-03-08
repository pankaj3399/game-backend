import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User, { type UserDocument } from '../models/User';
import Session from '../models/Session';
import {
	AUTH_TOKEN_AUDIENCE,
	AUTH_TOKEN_ISSUER,
	extractAuthToken,
	hashSessionToken,
} from '../lib/jwtAuth';

export interface IRequest extends Request {
	user: UserDocument;
}

const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const token = extractAuthToken(req);
	if (!token) {
		res.status(401).json({ message: 'Authorization required' });
		return;
	}

	const secret = process.env.JWT_SECRET;
	if (!secret) {
		res.status(500).json({ message: 'Server configuration error' });
		return;
	}

	try {
		jwt.verify(token, secret, {
			audience: AUTH_TOKEN_AUDIENCE,
			issuer: AUTH_TOKEN_ISSUER,
		});

		const session = await Session.findOne({
			$or: [{ tokenHash: hashSessionToken(token) }, { token }],
		}).exec();
		if (!session?.user) {
			res.status(401).json({ message: 'Session expired, login again' });
			return;
		}

		const user = await User.findById(session.user).select('_id email name alias role adminOf organizerOf').exec();
		if (!user) {
			res.status(401).json({ message: 'User not found, login again' });
			return;
		}

		(req as IRequest).user = user;
		next();
	} catch (error: unknown) {
		const err = error as { name?: string };
		if (err?.name === 'JsonWebTokenError') {
			res.status(401).json({ message: 'Invalid token' });
			return;
		}
		if (err?.name === 'TokenExpiredError') {
			res.status(401).json({ message: 'Token expired, login again' });
			return;
		}
		res.status(500).json({ message: 'Authentication error' });
	}
};

export default authenticate;
