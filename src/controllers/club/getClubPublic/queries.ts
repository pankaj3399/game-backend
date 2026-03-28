import mongoose from 'mongoose';
import Club from '../../../models/Club';
import Court from '../../../models/Court';
import Sponsor from '../../../models/Sponsor';

export async function findActiveClubPublicById(clubId: string) {
	return Club.findOne({ _id: clubId, status: 'active' })
		.select('_id name description address website bookingSystemUrl plan expiresAt trialPremiumUntil')
		.lean()
		.exec();
}

export async function findClubCourtsForPublicView(clubId: string) {
	return Court.find({ club: clubId }).select('type placement').lean().exec();
}

export async function findActiveClubSponsorsForPublicView(clubId: string) {
	return Sponsor.find({
		scope: 'club',
		club: clubId,
		status: 'active'
	})
		.select('_id name logoUrl link')
		.lean()
		.exec();
}
