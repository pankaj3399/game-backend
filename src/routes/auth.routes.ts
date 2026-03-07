import express from 'express';
import {
	appleAuth,
	appleAuthCallback,
	appleFormPostFix,
	completeSignUp,
	getMe,
	googleAuth,
	googleAuthCallback,
	logout,
} from '../controllers/auth/controller';
import authenticate from '../middlewares/auth';
import { validateBody } from '../lib/validation';
import { completeSignupSchema } from '../validation/auth.schemas';

const router = express.Router();

/** AppleCookieStateStore needs req.res to set/clear the state cookie. */
const attachRes = (req: express.Request, res: express.Response, next: express.NextFunction) => {
	(req as express.Request & { res?: express.Response }).res = res;
	next();
};

// Public routes
router.get('/google', googleAuth);
router.get('/google/callback', googleAuthCallback);
router.get('/apple', attachRes, appleAuth);
router.route('/apple/callback').get(attachRes, appleAuthCallback).post(attachRes, appleFormPostFix, appleAuthCallback);
router.post('/complete-signup', validateBody(completeSignupSchema), completeSignUp);
router.post('/logout', logout);

// Protected routes (require authenticated session)
router.get('/me', authenticate, getMe);
export default router;
