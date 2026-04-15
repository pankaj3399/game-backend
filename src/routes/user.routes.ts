import { Router } from 'express';
import {
	updateProfile,
	deleteAccount,
	getFavoriteClubs,
	addFavoriteClub,
	removeFavoriteClub,
	setHomeClub,
	getAdminClubs,
	searchUsers,
	getMyScore,
} from '../controllers/user/controller';
import { requireOrganiserOrAbove, requirePlayerOrAbove } from '../middlewares';
import { createAuthedRouter } from './authedRouter';

const router = Router();
const authed = createAuthedRouter(router);

// Public routes

// Protected routes (require authenticated session)
authed.patch('/update-profile', updateProfile);
authed.delete('/delete-account', deleteAccount);
authed.get('/favorite-clubs', getFavoriteClubs);
authed.get('/admin-clubs', getAdminClubs);
authed.get('/my-score', requirePlayerOrAbove, getMyScore);
authed.get('/search', requireOrganiserOrAbove, searchUsers);
authed.post('/favorite-clubs', addFavoriteClub);
authed.delete('/favorite-clubs/:clubId', removeFavoriteClub);
authed.patch('/home-club', setHomeClub);

export default router;