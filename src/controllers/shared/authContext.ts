import type { Request } from 'express';

export type AuthenticatedSession = NonNullable<Request['user']>;

export function buildPermissionContext(session: AuthenticatedSession) {
	return {
		userId: session._id.toString(),
		userRole: session.role,
		adminOf: (session.adminOf ?? []).map((id) => id.toString())
	};
}
