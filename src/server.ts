import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { connectToDatabase } from './lib/db';
import { logger } from './lib/logger';
import './lib/passport';
import passport from 'passport';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import adminRoutes from './routes/admin.routes';
import clubRoutes from './routes/club.routes';
import tournamentRoutes from './routes/tournament.routes';
import sponsorRoutes from './routes/sponsor.routes';
import uploadthingRoutes from './routes/uploadthing.routes';

const PORT = process.env.PORT || 4000;
const REQUEST_ORIGIN = process.env.REQUEST_ORIGIN?.trim();
const CORS_ORIGIN = process.env.CORS_ORIGIN?.trim();

const app = express();
app.set('trust proxy', 1);

const configuredOrigins = [CORS_ORIGIN, REQUEST_ORIGIN]
	.flatMap((value) => value?.split(',') ?? [])
	.map((value) => value.trim())
	.filter(Boolean);

const allowedOrigins = new Set([
	...configuredOrigins,
	// Apple Sign-In uses a form POST from appleid.apple.com; the browser sends that as Origin
	'https://appleid.apple.com',
]);

if (configuredOrigins.length === 0) {
	throw new Error('CORS_ORIGIN or REQUEST_ORIGIN must be set for authenticated requests');
}

app.use(
	cors({
		origin(origin, callback) {
			if (!origin || allowedOrigins.has(origin)) {
				return callback(null, true);
			}

			return callback(new Error('CORS origin not allowed'));
		},
		credentials: true
	})
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/', (req, res) => {
	res.send('Hello World');
});

async function start() {
	try {
		await connectToDatabase();
		logger.info('Database connected');

		app.use(passport.initialize());
		app.use('/api/auth', authRoutes);
		app.use('/api/user', userRoutes);
		app.use('/api/admin', adminRoutes);
		app.use('/api/clubs', clubRoutes);
		app.use('/api/tournaments', tournamentRoutes);
		app.use('/api/sponsors', sponsorRoutes);
		app.use('/api/uploadthing', uploadthingRoutes);

		app.listen(PORT, () => {
			logger.info(`Server is running on port ${PORT}`);
		});
	} catch (err) {
		logger.error('Failed to start server', { err });
		process.exit(1);
	}
}

start();
