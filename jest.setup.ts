import { logger } from './src/lib/logger';

logger.silent = true;

process.env.SESSION_SECRET ||= 'unit-test-session-secret';
process.env.JWT_SECRET ||= 'unit-test-jwt-secret';
