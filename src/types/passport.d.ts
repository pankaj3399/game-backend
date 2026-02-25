declare module 'passport-google-oauth20' {
	import type { Strategy } from 'passport';
	const GoogleStrategy: new (...args: unknown[]) => Strategy;
	export { GoogleStrategy as Strategy };
}

declare module 'passport-apple' {
	import type { Strategy } from 'passport';

	export interface AppleStrategyOptions {
		clientID: string;
		teamID: string;
		keyID: string;
		callbackURL: string;
		privateKeyString?: string;
		privateKeyLocation?: string;
		passReqToCallback?: boolean;
		responseType?: string;
		scope?: string[];
	}

	export type VerifyCallback = (err: Error | null, user?: unknown) => void;
	const AppleStrategy: new (options: AppleStrategyOptions, verify: (...args: unknown[]) => void) => Strategy;
	export { AppleStrategy as Strategy };
}
