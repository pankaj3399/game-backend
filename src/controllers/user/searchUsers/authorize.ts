import { error, ok } from '../../../shared/helpers';

function canSearchUsers(role: string) {
	return role === 'club_admin' || role === 'super_admin' || role === 'organiser';
}

export function authorizeSearchUsers(role: string) {
	if (!canSearchUsers(role)) {
		return error(403, 'Not authorized to search users');
	}

	return ok({ role }, { status: 200, message: 'Authorized to search users' });
}
