import express from 'express';
import authenticate from '../middlewares/auth';
import { requireSuperAdmin } from '../middlewares/rbac';
import { updateClubSubscription } from '../controllers/admin/updateClubSubscription';
import { getClubSubscriptionsOverview } from '../controllers/admin/getClubSubscriptionsOverview';
import {
	createPlatformSponsor,
	deletePlatformSponsor,
	getPlatformSponsors,
	updatePlatformSponsor
} from '../controllers/admin/platformSponsors';

const router = express.Router();

/** Super Admin only: health check for admin operations */
router.get('/ping', authenticate, requireSuperAdmin, (_req, res) => {
	res.json({ message: 'Admin access granted', role: 'super_admin' });
});

/**
 * Super Admin only: list all club subscriptions for admin overview.
 *
 * GET /clubs/subscriptions
 */
router.get('/clubs/subscriptions', authenticate, requireSuperAdmin, getClubSubscriptionsOverview);

/**
 * Super Admin only: update a club's subscription.
 *
 * PATCH /clubs/:clubId/subscription
 * Requires authentication and Super Admin privileges.
 */
router.patch('/clubs/:clubId/subscription', authenticate, requireSuperAdmin, updateClubSubscription);

/**
 * Super Admin only: platform sponsor management.
 */
router.get('/sponsors', authenticate, requireSuperAdmin, getPlatformSponsors);
router.post('/sponsors', authenticate, requireSuperAdmin, createPlatformSponsor);
router.patch('/sponsors/:sponsorId', authenticate, requireSuperAdmin, updatePlatformSponsor);
router.delete('/sponsors/:sponsorId', authenticate, requireSuperAdmin, deletePlatformSponsor);

export default router;
