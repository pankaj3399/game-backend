import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import cors from 'cors';
import { connectToDatabase } from './lib/db';
import { logger } from './lib/logger';
import { cookieSameSite, isProd } from './lib/config';
import './lib/passport';
import passport from 'passport';
import authRoutes from './routes/auth.routes';

const PORT = process.env.PORT || 4000;
const _sessionSecret = process.env.SESSION_SECRET;
if (!_sessionSecret) throw new Error('SESSION_SECRET environment variable is required');
const SESSION_SECRET: string = _sessionSecret;

const REQUEST_ORIGIN = process.env.REQUEST_ORIGIN;
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || REQUEST_ORIGIN;

if (!REQUEST_ORIGIN?.trim()) {
	throw new Error('REQUEST_ORIGIN environment variable is required (OAuth redirect target)');
}

if (isProd && !ALLOWED_ORIGIN?.trim()) {
	throw new Error('CORS_ORIGIN or REQUEST_ORIGIN is required in production (credentials: true requires explicit origin)');
}

const app = express();

app.use(
	cors({
		origin: ALLOWED_ORIGIN || (isProd ? false : true),
		credentials: true
	})
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
	res.send('Hello World');
});

async function start() {
	try {
		await connectToDatabase();
		logger.info('Database connected');

		const store = MongoStore.create({
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			clientPromise: Promise.resolve(mongoose.connection.getClient()) as any,
			dbName: process.env.MONGODB_DB_NAME || 'game',
			collectionName: 'sessions',
			ttl: 60 * 60 * 24 * 7, // 7 days
			autoRemove: 'native'
		});

		app.use(
			session({
				secret: SESSION_SECRET as string,
				resave: false,
				saveUninitialized: true, // Required for OAuth state + ensures session is persisted
				store,
				name: 'connect.sid',
				cookie: {
					httpOnly: true,
					secure: cookieSameSite === 'none' || isProd,
					sameSite: cookieSameSite,
					maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
					path: '/'
				}
			})
		);

		app.use(passport.initialize());
		app.use(passport.session());
		app.use('/api/auth', authRoutes);

		app.listen(PORT, () => {
			logger.info(`Server is running on port ${PORT}`);
		});
	} catch (err) {
		logger.error('Failed to start server', { err });
		process.exit(1);
	}
}

start();
