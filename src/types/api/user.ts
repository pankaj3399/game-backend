import type { UpdateProfileInput } from '../../validation/user.schemas';

export interface UserClubSummary {
	id: string;
	name: string;
}

export interface SearchUserItem {
	id: string;
	email: string;
	name: string | null;
	alias: string | null;
}

export interface SearchUsersResponse {
	users: SearchUserItem[];
}

export interface UserMutationMessageResponse {
	message: string;
}

export type UpdateProfileBody = UpdateProfileInput;
