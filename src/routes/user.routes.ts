import express from 'express';
import {
	updateProfile,
	deleteAccount,
} from '../controllers/user/controller';
import authenticate from '../middlewares/auth';
import { validateBody } from '../lib/validation';
import { updateProfileSchema } from '../validation/user.schemas';

const router = express.Router();

// Public routes

// Protected routes (require authenticated session)
router.patch('/update-profile', authenticate, validateBody(updateProfileSchema), updateProfile);
router.delete('/delete-account', authenticate, deleteAccount);

export default router;