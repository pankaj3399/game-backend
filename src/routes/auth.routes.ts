import express from 'express';
import {
	appleAuth,
	appleAuthCallback,
	completeSignUp,
	googleAuth,
	googleAuthCallback
} from '../controllers/auth.controller';
const router = express.Router();

router.get('/google', googleAuth);
router.get('/google/callback', googleAuthCallback);

router.get('/apple', appleAuth);
router.route('/apple/callback').get(appleAuthCallback).post(appleAuthCallback);

router.post('/complete-signup', completeSignUp);

export default router;
