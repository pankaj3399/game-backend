import { Router } from 'express';
import { getPlayerScore } from '../controllers/user/getPlayerScore/index';

const router = Router();

router.get('/:userId/score', getPlayerScore);

export default router;
