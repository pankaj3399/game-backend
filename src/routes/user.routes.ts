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
// import { requireClubAdminOrAbove } from '../middlewares/rbac';

const router = express.Router();

// Public routes

// Protected routes (require authenticated session)
router.patch('/update-profile', authenticate, updateProfile);
router.delete('/delete-account', authenticate, deleteAccount);
router.get('/favorite-clubs', authenticate, getFavoriteClubs);
router.get('/admin-clubs', authenticate, getAdminClubs);
// Todo: Add clubAdminOrAbove requirement to user search route since it's only used for adding club staff, and we don't want regular players to be able to search users by alias (which is the main use case for this endpoint)
router.get('/search', authenticate, searchUsers);
router.post('/favorite-clubs', authenticate, addFavoriteClub);
router.delete('/favorite-clubs/:clubId', authenticate, removeFavoriteClub);
router.patch('/home-club', authenticate, setHomeClub);

export default router;