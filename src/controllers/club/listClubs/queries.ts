import Club from '../../../models/Club';

export async function countActiveClubs() {
	return Club.countDocuments({ status: 'active' }).exec();
}

export async function findActiveClubsPage(skip: number, limit: number) {
	return Club.find({ status: 'active' })
		.select('_id name address website')
		.sort({ name: 1 })
		.skip(skip)
		.limit(limit)
		.lean()
		.exec();
}
