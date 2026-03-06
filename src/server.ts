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

const PORT = process.env.PORT || 4000;

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

		app.use(passport.initialize());
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
