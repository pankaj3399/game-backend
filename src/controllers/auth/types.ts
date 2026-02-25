/** Request body for completing signup (alias, name, etc.) after OAuth. */
export interface ICompleteSignup {
	email?: string;
	alias?: string;
	name?: string;
	dateOfBirth?: string | null;
	gender?: string | null;
	appleId?: string;
}

/** Shape Passport receives from Google strategy (verify callback profile). */
export interface GoogleProfile {
	id: string;
	emails?: { value: string }[];
}

/** Shape Passport receives from Apple strategy (verify callback profile). */
export interface AppleProfile {
	sub: string;
	email?: string;
}
