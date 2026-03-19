import express from 'express';
import { getAllSponsors } from '../controllers/sponsor/controller';

const router = express.Router();

// List all unique sponsors across all clubs (public)
router.get('/', getAllSponsors);

export default router;
