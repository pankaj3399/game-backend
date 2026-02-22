/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/user';
import { Strategy as AppleStrategy, VerifyCallback } from 'passport-apple';
import { jwtDecode } from 'jwt-decode';

type AppleProfile = {
	id: string;
	email?: string;
	name?: {
		firstName: string;
		lastName: string;
	};
};

// Google OAuth Strategy
passport.use(
	new GoogleStrategy(
		{
			clientID: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
			callbackURL: process.env.GOOGLE_CALLBACK_URL as string //'/api/auth/google/callback'
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		async (accessToken: string, refreshToken: string, profile: any, done: Function) => {
			// Use Function type for `done`
			try {
				const { id, emails } = profile;
				const email = emails && emails[0]?.value;

				if (!email) {
					return done(new Error('No email found in Google profile'), undefined);
				}

				const isUser = await User.findOne({ googleId: id });

				// If user exist just return the user after verifying it
				if (isUser) {
					return done(null, isUser);
				}

				const newUser = new User({
					googleId: id,
					email: email
				});
				await newUser.save();

				done(null, newUser);
			} catch (error) {
				done(error as Error); // Ensure `error` is cast to `Error`
			}
		}
	)
);

passport.use(
	new AppleStrategy(
		{
			clientID: process.env.APPLE_CLIENT_ID as string,
			teamID: process.env.APPLE_TEAM_ID as string,
			keyID: process.env.APPLE_KEY_ID as string,
			privateKeyString: `-----BEGIN PRIVATE KEY-----\n${process.env.APPLE_PRIVATE_KEY as string}\n-----END PRIVATE KEY-----`,
			callbackURL: process.env.APPLE_CALLBACK_URL as string,
			responseType: 'code id_token',
			scope: ['name', 'email', 'profile'],
			passReqToCallback: false
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		async (accessToken: string, refreshToken: string, idToken: string, profile: any, done: VerifyCallback) => {
			try {
				const decoded = jwtDecode<{
					sub: string;
					email?: string;
					email_verified?: boolean;
					name?: { firstName?: string; lastName?: string };
				}>(idToken);
				const { sub, email } = decoded;

				let isUser;
				// If user has profile - first login
				if (profile?.id) {
					isUser = await User.findOne({ appleId: profile?.id });
				} else if (sub) {
					isUser = await User.findOne({ appleId: sub });
				}

				// check if user has same id and registered with
				if (isUser) {
					return done(null, isUser);
				}

				const newUser = new User({
					appleId: sub,
					email: profile?.email ? profile?.email : email
				});
				await newUser.save();
				done(null, newUser);
			} catch (error) {
				done(error as Error); // Ensure `error` is cast to `Error`
			}
		}
	)
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
passport.serializeUser((user: any, done: Function) => {
	done(null, user.id);
});

passport.deserializeUser(async (id: string, done: Function) => {
	try {
		const userInfo = await User.findById(id);
		done(null, userInfo);
	} catch (error) {
		done(error as Error, undefined); // Ensure `error` is cast to `Error`
	}
});
