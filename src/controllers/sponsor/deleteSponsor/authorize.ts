import { buildPermissionContext, type AuthenticatedSession } from '../../shared/authContext';
import { error, ok } from '../../shared/helpers';

export async function authorizeDeleteSponsor(session: AuthenticatedSession, clubId: string) {
	const context = buildPermissionContext(session);
	const isAdmin = context.adminOf.includes(clubId);
	if (!isAdmin && context.userRole !== 'super_admin') {
		return error(403, 'You do not have permission to manage this club');
	}

	return ok({}, { status: 200, message: 'Authorized' });
}
