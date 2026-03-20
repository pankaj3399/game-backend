import express from 'express';
import authenticate from '../middlewares/auth';
import { requireSuperAdmin } from '../middlewares/rbac';

const router = express.Router();

/** Super Admin only: health check for admin operations */
router.get('/ping', authenticate, requireSuperAdmin, (_req, res) => {
	res.json({ message: 'Admin access granted', role: 'super_admin' });
});

export default router;
