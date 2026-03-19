import User from '../../../models/User';

type SearchUserDoc = {
	_id: { toString(): string };
	email: string;
	name: string | null;
	alias: string | null;
};

export async function findUsersBySearchQuery(searchRegex: RegExp) {
	return User.find({
		$or: [{ name: searchRegex }, { alias: searchRegex }, { email: searchRegex }]
	})
		.select('_id email name alias')
		.limit(20)
		.lean<SearchUserDoc[]>()
		.exec();
}
