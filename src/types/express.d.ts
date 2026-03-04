declare global {
	namespace Express {
		interface User {
			_id: import('mongoose').Types.ObjectId;
			email: string;
			name?: string | null;
			alias?: string | null;
			dateOfBirth?: Date | null;
			gender?: 'male' | 'female' | 'other' | null;
			role?: 'player' | 'organiser' | 'club_admin' | 'super_admin';
			adminOf?: import('mongoose').Types.ObjectId[];
			organizerOf?: import('mongoose').Types.ObjectId[];
		}
	}
}

export {};
