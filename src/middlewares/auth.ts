import type { Request, Response, NextFunction } from 'express';
import type { IUser } from '../models/User';

export interface IRequest extends Request {
	user: IUser;
}

const authenticate = (req: Request, res: Response, next: NextFunction): void => {
	if (!req.user) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}
	next();
};

export default authenticate;
