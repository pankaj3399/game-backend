import express from 'express';
import {
	appleAuth,
	appleAuthCallback,
	completeSignUp,
	getMe,
	googleAuth,
	googleAuthCallback,
	logout
} from '../controllers/auth/controller';
import authenticate from '../middlewares/auth';
import { validateBody } from '../lib/validation';
import { completeSignupSchema } from '../validation/auth.schemas';

const router = express.Router();

// Public routes
router.get('/google', googleAuth);
router.get('/callback/google', googleAuthCallback);
router.get('/apple', appleAuth);
router.route('/callback/apple').get(appleAuthCallback).post(appleAuthCallback);
router.post('/complete-signup', validateBody(completeSignupSchema), completeSignUp);
router.post('/logout', logout);

// Protected routes (require authenticated session)
router.get('/me', authenticate, getMe);

export default router;