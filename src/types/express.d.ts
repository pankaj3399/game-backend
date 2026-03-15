declare global {
	namespace Express {
		interface User {
			_id: string;
			email: string;
			name: string;
			alias?: string | null;
			dateOfBirth?: Date | null;
			gender?: 'male' | 'female' | 'other';
			role: 'player' | 'organiser' | 'club_admin' | 'super_admin';
			adminOf?: string[];
			organizerOf?: string[];
		}
	}
}

export {};
