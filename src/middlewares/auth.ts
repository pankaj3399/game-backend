import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Session from '../models/Session';
import { type IUser } from '../models/User';

interface IRequest extends Request {
	user?: IUser;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authenticate: any = async (req: IRequest, res: Response, next: NextFunction) => {
	const authHeader = req.headers['authorization'];
	if (!authHeader) {
		return res.status(401).json({ message: 'Authorization header is missing' });
	}

	const [bearer, token] = authHeader.split(' ');
	if (bearer?.toLowerCase() !== 'bearer' || !token) {
		return res.status(401).json({ message: 'Invalid authorization header format' });
	}

	try {
		// Verify token (assuming it's a JWT)
		jwt.verify(token, process.env.JWT_SECRET as string);

		// Get user session
		const session = await Session.findOne({ token }).populate('user');
		if (!session) {
			return res.status(401).json({ message: 'Session expired, login again' });
		}

		if (!session.user) {
			return res.status(401).json({ message: 'No user linked with the session, login again' });
		}

		// user is populated above
		req.user = session.user as unknown as IUser;
		next();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} catch (error: any) {
		if (error.name === 'JsonWebTokenError') {
			return res.status(401).json({ message: 'Invalid token' });
		}
		if (error.name === 'TokenExpiredError') {
			return res.status(401).json({ message: 'Token expired, login again' });
		}
		return res.status(500).json({ messages: ['Server error', error?.message] });
	}
};

export default authenticate;