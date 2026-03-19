import mongoose from 'mongoose';

export type AdminClubDoc = {
	_id: mongoose.Types.ObjectId;
	name: string;
};

export type UserAdminClubsDoc = {
	adminOf: AdminClubDoc[];
};

export type CourtCountRow = {
	_id: mongoose.Types.ObjectId;
	count: number;
};
