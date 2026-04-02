import { escapeRegex } from '../../../lib/validation';
import { ok } from '../../../shared/helpers';
import { authorizeSearchUsers } from './authorize';
import { mapSearchUsersResponse } from './mapper';
import { findUsersBySearchQuery } from './queries';

export async function searchUsersFlow(role: string, query: {q: string}) {
	const authResult = authorizeSearchUsers(role);
	if (authResult.status !== 200) {
		return authResult;
	}

	const trimmedQuery = query.q?.trim() ?? '';

	if (trimmedQuery.length < 1) {
		return ok({ users: [] }, { status: 200, message: 'Users fetched successfully' });
	}

	const searchRegex = new RegExp(escapeRegex(trimmedQuery), 'i');
	const users = await findUsersBySearchQuery(searchRegex);

	return ok(
		mapSearchUsersResponse(users),
		{ status: 200, message: 'Users fetched successfully' }
	);
}
