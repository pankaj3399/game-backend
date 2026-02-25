import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as AppleStrategy } from 'passport-apple';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User, { type UserDocument } from '../models/User';
import UserAuth from '../models/UserAuth';
import { logger } from '../lib/logger';

// ---------------------------------------------------------------------------
// Shared upsert helper — atomically finds or creates a User by email.
// Returns { user, created } where created=true means this is a new signup.
// ---------------------------------------------------------------------------
async function findOrCreateUserByEmail(
	email: string,
	session: mongoose.ClientSession
){
	const existing = await User.findOne({ email }).session(session);
	if (existing) return { user: existing, created: false };

	const [newUser] = await User.create([{ email }], { session });
	if (!newUser) throw new Error('User creation failed');
	return { user: newUser, created: true };
}

// ---------------------------------------------------------------------------
// Google OAuth Strategy
// ---------------------------------------------------------------------------
if (
	process.env.GOOGLE_CLIENT_ID &&
	process.env.GOOGLE_CLIENT_SECRET &&
	process.env.GOOGLE_CALLBACK_URL
) {
	passport.use(
		new GoogleStrategy(
			{
				clientID: process.env.GOOGLE_CLIENT_ID,
				clientSecret: process.env.GOOGLE_CLIENT_SECRET,
				callbackURL: process.env.GOOGLE_CALLBACK_URL,
				scope: ['profile', 'email'],
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async (_accessToken: string, _refreshToken: string, profile: any, done: (err: Error | null, user?: any) => void) => {
				const session = await mongoose.startSession();
				session.startTransaction();

				try {
					const googleId = profile.id;
					const email = profile.emails?.[0]?.value;

					if (!email) {
						await session.abortTransaction();
						return done(new Error('No email returned from Google — ensure email scope is granted'));
					}

					// 1. Existing user by googleId
					const byGoogleId = await UserAuth.findOne({ googleId }).populate('user').session(session);
					if (byGoogleId?.user) {
						await session.abortTransaction();
						logger.info('Google sign-in by googleId', { googleId });
						return done(null, byGoogleId.user as unknown as Express.User);
					}

					// 2. Existing user by email (e.g. previously signed up with Apple)
					const { user, created } = await findOrCreateUserByEmail(email, session);

					const existingAuth = await UserAuth.findOne({ user: user._id }).session(session);
					if (existingAuth) {
						if (existingAuth.googleId && existingAuth.googleId !== googleId) {
							await session.abortTransaction();
							return done(new Error('Google account conflict: this email is already linked to a different Google account'));
						}
						if (!existingAuth.googleId) {
							existingAuth.googleId = googleId;
							await existingAuth.save({ session });
							logger.info('Linked googleId to existing user', { userId: user._id });
						}
					} else {
						await UserAuth.create([{ user: user._id, googleId }], { session });
					}

					await session.commitTransaction();
					logger.info(created ? 'Google sign-up: new user created' : 'Google sign-in by email', {
						userId: user._id,
					});
					return done(null, user as Express.User);
				} catch (error) {
					await session.abortTransaction();
					logger.error('Google strategy error', { error });
					return done(error as Error);
				} finally {
					await session.endSession();
				}
			}
		)
	);
} else {
	logger.warn('Google OAuth strategy not registered — missing environment variables');
}

// ---------------------------------------------------------------------------
// Apple OAuth Strategy
// ---------------------------------------------------------------------------
if (
	process.env.APPLE_CLIENT_ID &&
	process.env.APPLE_TEAM_ID &&
	process.env.APPLE_KEY_ID &&
	process.env.APPLE_PRIVATE_KEY &&
	process.env.APPLE_CALLBACK_URL
) {
	passport.use(
		new AppleStrategy(
			{
				clientID: process.env.APPLE_CLIENT_ID,
				teamID: process.env.APPLE_TEAM_ID,
				keyID: process.env.APPLE_KEY_ID,
				privateKeyString: process.env.APPLE_PRIVATE_KEY!.trim(),
				callbackURL: process.env.APPLE_CALLBACK_URL,
				responseType: 'code id_token',
				scope: ['name', 'email'],
				passReqToCallback: false,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			} as any,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(async (...args: unknown[]) => {
				const [_accessToken, _refreshToken, idToken, _profile, done] = args as [string, string, string, any, (err: Error | null, user?: any) => void];
				const session = await mongoose.startSession();
				session.startTransaction();

				try {
					const decoded = jwt.decode(idToken) as { sub?: string; email?: string } | null;
					if (!decoded?.sub) {
						await session.abortTransaction();
						return done(new Error('Apple id_token could not be decoded'));
					}
					const appleId = decoded.sub;
					const email = decoded.email;

					// 1. Existing user by appleId
					const byAppleId = await UserAuth.findOne({ appleId }).populate('user').session(session);
					if (byAppleId?.user) {
						await session.abortTransaction();
						logger.info('Apple sign-in by appleId', { appleId });
						return done(null, byAppleId.user as unknown as Express.User);
					}

					// 2. Apple only provides email on the FIRST login
					if (email) {
						const { user, created } = await findOrCreateUserByEmail(email, session);
						const existingAuth = await UserAuth.findOne({ user: user._id }).session(session);
						if (existingAuth) {
							if (existingAuth.appleId && existingAuth.appleId !== appleId) {
								await session.abortTransaction();
								return done(new Error('Apple account conflict: this email is already linked to a different Apple account'));
							}
							if (!existingAuth.appleId) {
								existingAuth.appleId = appleId;
								await existingAuth.save({ session });
								logger.info('Linked appleId to existing user', { userId: user._id });
							}
						} else {
							await UserAuth.create([{ user: user._id, appleId }], { session });
						}

						await session.commitTransaction();
						logger.info(created ? 'Apple sign-up: new user created' : 'Apple sign-in by email', {
							userId: user._id,
						});
						return done(null, user as Express.User);
					}

					// 3. No email available
					logger.warn('Apple sign-in: no email and no matching appleId', { appleId });
					await session.abortTransaction();
					return done(new Error('Unable to identify Apple user: no email provided and no existing account found'));
				} catch (error) {
					await session.abortTransaction();
					logger.error('Apple strategy error', { error });
					return done(error as Error);
				} finally {
					await session.endSession();
				}
			})
		)
	);
} else {
	logger.warn('Apple OAuth strategy not registered — missing environment variables');
}

// ---------------------------------------------------------------------------
// Serialize / Deserialize
// ---------------------------------------------------------------------------
passport.serializeUser((user: Express.User, done) => {
	const typedUser = user as UserDocument;
	done(null, typedUser._id.toString());
});

passport.deserializeUser(async (id: string, done) => {
	try {
		const user = await User.findById(id)
			.select('_id email name alias userType')
			.lean();
		if (!user) {
			// User deleted after session was created
			return done(null, false);
		}
		done(null, user as Express.User);
	} catch (error) {
		logger.error('deserializeUser error', { error, id });
		done(error as Error);
	}
});