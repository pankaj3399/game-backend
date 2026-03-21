import { buildPermissionContext, type AuthenticatedSession } from '../../../shared/authContext';
import { userCanManageClub } from '../../../lib/permissions';
import { error, ok } from '../../../shared/helpers';

export async function authorizeDeleteSponsor(session: AuthenticatedSession, clubId: string) {
	const context = buildPermissionContext(session);
	if (!(await userCanManageClub(context, clubId))) {
		return error(403, 'You do not have permission to manage this club');
	}

	return ok({}, { status: 200, message: 'Authorized' });
}
