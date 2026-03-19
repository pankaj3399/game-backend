import User from '../../../models/User';
import { escapeRegex } from '../../../lib/validation';

export function findUserByAlias(username: string) {
	return User.findOne({
		alias: { $regex: `^${escapeRegex(username)}$`, $options: 'i' }
	})
		.select('_id email name alias role')
		.exec();
}
