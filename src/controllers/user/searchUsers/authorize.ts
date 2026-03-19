import { error, ok } from '../../../shared/helpers';

// TODO: Remove player role from this check once super_admins can also search users. Currently left in temporarily to allow player access for initial setup/testing of user search functionality.
function canSearchUsers(role: string) {
	return role === 'club_admin' || role === 'super_admin' || role === 'player';
}

export function authorizeSearchUsers(role: string) {
	if (!canSearchUsers(role)) {
		return error(403, 'Not authorized to search users');
	}

	return ok({ role }, { status: 200, message: 'Authorized to search users' });
}
