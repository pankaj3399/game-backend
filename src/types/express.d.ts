declare global {
	namespace Express {
		interface User {
			_id: import('mongoose').Types.ObjectId;
			email: string;
			name?: string | null;
			alias?: string | null;
			dateOfBirth?: Date | null;
			gender?: 'male' | 'female' | 'other' | null;
			userType?: 'admin' | 'user';
		}
	}
}

export {};
