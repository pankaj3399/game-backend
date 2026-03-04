import type { Request, Response, NextFunction } from 'express';
import { ROLES, type Role, hasRoleOrAbove, hasAnyRole } from '../constants/roles';

/**
 * RBAC middleware factory.
 * Require user to have at least one of the given roles (hierarchy-aware).
 * Must be used after authenticate middleware.
 */
export function requireRoles(...allowedRoles: Role[]) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const user = req.user;
		if (!user) {
			res.status(401).json({ message: 'Authentication required' });
			return;
		}

		const userRole = user.role;
		const hasAccess = allowedRoles.some((r) => hasRoleOrAbove(userRole, r));

		if (!hasAccess) {
			res.status(403).json({
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
			});
			return;
		}
		next();
	};
}

/**
 * Require user to have exactly one of the given roles (no hierarchy).
 * Must be used after authenticate middleware.
 */
export function requireExactRoles(...allowedRoles: Role[]) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const user = req.user;
		if (!user) {
			res.status(401).json({ message: 'Authentication required' });
			return;
		}

		const userRole = user.role;
		if (!hasAnyRole(userRole, allowedRoles)) {
			res.status(403).json({
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
			});
			return;
		}
		next();
	};
}

/** Require Super Admin only */
export const requireSuperAdmin = requireRoles(ROLES.SUPER_ADMIN);

/** Require Club Admin or above (Club Admin, Super Admin) */
export const requireClubAdminOrAbove = requireRoles(ROLES.CLUB_ADMIN, ROLES.SUPER_ADMIN);

/** Require Organiser or above (Organiser, Club Admin, Super Admin) */
export const requireOrganiserOrAbove = requireRoles(ROLES.ORGANISER, ROLES.CLUB_ADMIN, ROLES.SUPER_ADMIN);

/** Require any authenticated user (Player or above) - use with authenticate */
export const requirePlayerOrAbove = requireRoles(ROLES.PLAYER, ROLES.ORGANISER, ROLES.CLUB_ADMIN, ROLES.SUPER_ADMIN);
