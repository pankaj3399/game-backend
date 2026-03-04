import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { connectToDatabase } from './lib/db';
import { logger } from './lib/logger';
import { cookieSameSite, isProd } from './lib/config';
import './lib/passport';
import passport from 'passport';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import adminRoutes from './routes/admin.routes';
import clubRoutes from './routes/club.routes';

const PORT = process.env.PORT || 4000;
const _sessionSecret = process.env.SESSION_SECRET;
if (!_sessionSecret) throw new Error('SESSION_SECRET environment variable is required');
const SESSION_SECRET: string = _sessionSecret;

const app = express();

app.use(
	cors({
		origin: true,
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

		// Session for OAuth flow state only (MemoryStore). Auth is JWT-based via cookie.
		app.use(
			session({
				secret: SESSION_SECRET,
				resave: false,
				saveUninitialized: true,
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
		app.use('/api/user', userRoutes);
		app.use('/api/admin', adminRoutes);
		app.use('/api/clubs', clubRoutes);

		app.listen(PORT, () => {
			logger.info(`Server is running on port ${PORT}`);
		});
	} catch (err) {
		logger.error('Failed to start server', { err });
		process.exit(1);
	}
}

start();
