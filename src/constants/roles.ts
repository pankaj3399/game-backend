/**
 * RBAC: Role-Based Access Control
 * Roles: Player, Organiser, Club Admin, Super Admin
 */

export const ROLES = {
	PLAYER: 'player',
	ORGANISER: 'organiser',
	CLUB_ADMIN: 'club_admin',
	SUPER_ADMIN: 'super_admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Role hierarchy (higher index = more privileges). Used for "at least X" checks. */
export const ROLE_HIERARCHY: Role[] = [
	ROLES.PLAYER,
	ROLES.ORGANISER,
	ROLES.CLUB_ADMIN,
	ROLES.SUPER_ADMIN,
];

/** Check if role A has at least the privileges of role B */
export function hasRoleOrAbove(userRole: Role | string | undefined, required: Role): boolean {
	if (!userRole) return false;
	const userIdx = ROLE_HIERARCHY.indexOf(userRole as Role);
	const reqIdx = ROLE_HIERARCHY.indexOf(required);
	if (userIdx === -1 || reqIdx === -1) return false;
	return userIdx >= reqIdx;
}

/** Check if user has exactly one of the given roles */
export function hasAnyRole(userRole: Role | string | undefined, allowed: Role[]): boolean {
	if (!userRole) return false;
	return allowed.includes(userRole as Role);
}
