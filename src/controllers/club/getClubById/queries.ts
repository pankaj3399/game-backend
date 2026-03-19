import Club from '../../../models/Club';
import Court from '../../../models/Court';

export async function findClubById(clubId: string) {
	return Club.findById(clubId).lean().exec();
}

export async function findClubCourtsByClubId(clubId: string) {
	return Court.find({ club: clubId }).select('_id name type placement').lean().exec();
}
