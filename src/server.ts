import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { LogError } from './utils/logs';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import publicRoutes from './routes/public.routes';
import session from 'express-session';
import passport from 'passport';
import './config/passport';
import authenticate from './middleware/authenticate';

const PORT = process.env.PORT || 5001;

const app = express();

// Increase the size limit for JSON payloads and URL-encoded payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: false }));

app.use(
	session({
		secret: process.env.SESSION_SECRET as string,
		resave: false,
		saveUninitialized: true
	})
);
app.use(passport.initialize());
app.use(passport.session());

// Configure CORS
app.use(cors({ origin: true })); // Allows all origins

// Allow preflight requests
app.options('*', cors());

mongoose
	.connect(process.env.MONGODB_URI as string)
	.then(() => {
		app.listen(PORT, () => {
			console.log(`🚀 MongoDB Server Ready`);
			console.log(`🚀 app is listening on port ${PORT}`);
		});

		// Home route
		app.get('/', (req, res) => {
			res.send(`Running on port ${PORT}`);
		});

		// Public routes
		app.use(`/api/auth`, authRoutes);
		app.use(`/api/v1/public`, publicRoutes);
		app.use(`/api/v1/user`, authenticate, userRoutes);
	})
	.catch((err) => {
		LogError(__dirname, 'MongoDB_Connection', 'MongoDB_Connection', err);
	});
