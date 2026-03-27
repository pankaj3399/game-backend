import type { ObjectId } from 'mongodb';
import type { AuthenticatedSession } from './authContext';

/** Minimal club fields used for club-staff RBAC (matches staff snapshot selects). */
export type ClubStaffAccessSnapshot = {
	defaultAdminId?: { toString(): string } | null;
};

export interface ClubStaffBasePermissions {
	canManageOrganisers: boolean;
	canManageAdmins: boolean;
}

export type ComputeClubStaffPermissionsResult =
	| { ok: false }
	| ({ ok: true } & ClubStaffBasePermissions);

export type ClubStaffActorFields = {
	id: string;
	role: string;
	adminOf?: Array<string | ObjectId>;
};

/** RBAC from explicit actor fields (session or DB snapshot); use inside transactions with a session-bound user read. */
export function computeClubStaffPermissionsForActor(
	club: ClubStaffAccessSnapshot,
	clubId: string,
	actor: ClubStaffActorFields
): ComputeClubStaffPermissionsResult {
	const defaultAdminId = club.defaultAdminId?.toString() ?? null;
	const isSuperAdmin = actor.role === 'super_admin';
	const isClubAdmin = (actor.adminOf ?? []).some((id) => String(id) === clubId);
	const isDefaultAdmin = defaultAdminId === actor.id;

	if (!isSuperAdmin && !isClubAdmin) {
		return { ok: false };
	}

	return {
		ok: true,
		canManageOrganisers: isSuperAdmin || isClubAdmin,
		canManageAdmins: isSuperAdmin || isDefaultAdmin
	};
}

export function computeClubStaffPermissions(
	session: AuthenticatedSession,
	club: ClubStaffAccessSnapshot,
	clubId: string
): ComputeClubStaffPermissionsResult {
	return computeClubStaffPermissionsForActor(club, clubId, {
		id: session._id.toString(),
		role: session.role,
		adminOf: session.adminOf
	});
}
