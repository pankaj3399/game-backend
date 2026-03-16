import Club from '../../../models/Club';

export async function findActiveClubsByName(query: string) {
	return Club.find({
		status: 'active',
		name: { $regex: query, $options: 'i' }
	})
		.select('_id name')
		.limit(20)
		.lean()
		.exec();
}
