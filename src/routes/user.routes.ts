import express from 'express';
import {
	updateProfile,
	deleteAccount,
	getFavoriteClubs,
	addFavoriteClub,
	removeFavoriteClub,
	setHomeClub,
	getAdminClubs,
	searchUsers,
} from '../controllers/user/controller';
import authenticate from '../middlewares/auth';
import { requireClubAdminOrAbove } from '../middlewares/rbac';
import { validateBody } from '../lib/validation';
import {
	updateProfileSchema,
	addFavoriteClubSchema,
	setHomeClubSchema,
} from '../validation/user.schemas';

const router = express.Router();

// Public routes

// Protected routes (require authenticated session)
router.patch('/update-profile', authenticate, validateBody(updateProfileSchema), updateProfile);
router.delete('/delete-account', authenticate, deleteAccount);
router.get('/favorite-clubs', authenticate, getFavoriteClubs);
router.get('/admin-clubs', authenticate, requireClubAdminOrAbove, getAdminClubs);
router.get('/search', authenticate, requireClubAdminOrAbove, searchUsers);
router.post('/favorite-clubs', authenticate, validateBody(addFavoriteClubSchema), addFavoriteClub);
router.delete('/favorite-clubs/:clubId', authenticate, removeFavoriteClub);
router.patch('/home-club', authenticate, validateBody(setHomeClubSchema), setHomeClub);

export default router;