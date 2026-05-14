import mongoose from 'mongoose';

export type AdminClubDoc = {
	_id: mongoose.Types.ObjectId;
	name: string;
	logoUrl?: string | null;
};

export type UserAdminClubsDoc = AdminClubDoc[] | null;

export type CourtCountRow = {
	_id: mongoose.Types.ObjectId;
	count: number;
};
