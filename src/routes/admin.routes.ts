import express from 'express';
import authenticate from '../middlewares/auth';
import { requireSuperAdmin } from '../middlewares/rbac';
import { updateClubSubscription } from '../controllers/admin/updateClubSubscription';

const router = express.Router();

/** Super Admin only: health check for admin operations */
router.get('/ping', authenticate, requireSuperAdmin, (_req, res) => {
	res.json({ message: 'Admin access granted', role: 'super_admin' });
});

/**
 * Super Admin only: update a club's subscription.
 *
 * PATCH /clubs/:clubId/subscription
 * Requires authentication and Super Admin privileges.
 */
router.patch('/clubs/:clubId/subscription', authenticate, requireSuperAdmin, updateClubSubscription);

export default router;
