import mongoose from 'mongoose';

/** Populated club from populate('club', 'name') */
interface PopulatedClub {
	_id: mongoose.Types.ObjectId;
	name: string;
}

/** Populated sponsor from populate('sponsorId', 'name logoUrl link') */
interface PopulatedSponsor {
	_id: mongoose.Types.ObjectId;
	name: string;
	logoUrl?: string | null;
	link?: string | null;
}

/** Tournament lean doc with club and sponsor populated */
interface TournamentListDoc {
	_id: mongoose.Types.ObjectId;
	name: string;
	club: PopulatedClub | null;
	date?: Date;
	status: 'active' | 'draft' | 'inactive';
	sponsorId?: PopulatedSponsor | null;
}

export type { PopulatedClub, PopulatedSponsor, TournamentListDoc };