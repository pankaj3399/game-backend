import mongoose from 'mongoose';
import type { Role } from '../../../constants/roles';

export type AdminClubDoc = {
	_id: mongoose.Types.ObjectId;
	name: string;
};

export type UserAdminClubsDoc = {
	adminOf: AdminClubDoc[];
	role: Role;
};

export type CourtCountRow = {
	_id: mongoose.Types.ObjectId;
	count: number;
};
