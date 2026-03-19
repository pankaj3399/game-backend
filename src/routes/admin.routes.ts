import express from 'express';
import authenticate from '../middlewares/auth';
import { requireSuperAdmin } from '../middlewares/rbac';
import { promoteUserToSuperAdmin } from '../controllers/admin/promoteUserToSuperAdmin';

const router = express.Router();

/** Super Admin only: health check for admin operations */
router.get('/ping', authenticate, requireSuperAdmin, (_req, res) => {
	res.json({ message: 'Admin access granted', role: 'super_admin' });
});

/**
 * Super Admin only: promote a user to super_admin by username with promotion password.
 */

// Todo: Add requireSuperAdmin middleware once we have at least one super_admin to prevent lockout. Currently left open for initial setup/testing of promoteUserToSuperAdmin functionality.
router.post('/promote-super-admin', authenticate, promoteUserToSuperAdmin);

export default router;
