import type { Request } from 'express';
import { userCanManageClubAsAdmin } from '../../../lib/permissions';
import { buildPermissionContext } from '../../../shared/authContext';
import { error, ok } from '../../../shared/helpers';
import { findClubAdmins, findClubStaffSnapshotById, findOrganiserUsersByIds } from './queries';
import { logger } from '../../../lib/logger';

type Session = NonNullable<Request['user']>;

export async function getClubStaffFlow(clubId: string, session: Session) {
	try{
		const ctx = buildPermissionContext(session);
		if (!userCanManageClubAsAdmin(ctx, clubId)) {
			return error(403, 'You do not have permission to manage this club');
		}
	
		const club = await findClubStaffSnapshotById(clubId);
		if (!club) {
			return error(404, 'Club not found');
		}
	
		const admins = await findClubAdmins(clubId);
	
		const defaultAdminId = club.defaultAdminId?.toString() ?? null;
		const organiserIdStrings = (club.organiserIds ?? []).map((id) => id.toString());
	
		const organiserUsers = await findOrganiserUsersByIds(organiserIdStrings);
	
		const adminIds = new Set(admins.map((admin) => admin._id.toString()));
	
		const sortedAdmins = [...admins].sort((a, b) => {
			const aId = a._id.toString();
			const bId = b._id.toString();
			if (defaultAdminId === aId) {
				return -1;
			}
			if (defaultAdminId === bId) {
				return 1;
			}
			return 0;
		});
	
		const staff = [
			...sortedAdmins.map((user) => {
				const id = user._id.toString();
				const isDefault = id === defaultAdminId;
				return {
					id,
					email: user.email,
					name: user.name ?? null,
					alias: user.alias ?? null,
					role: isDefault ? 'default_admin' : 'admin',
					roleLabel: isDefault ? 'Main Admin' : 'Admin'
				};
			}),
			...organiserUsers
				.filter((user) => !adminIds.has(user._id.toString()))
				.map((user) => ({
					id: user._id.toString(),
					email: user.email,
					name: user.name ?? null,
					alias: user.alias ?? null,
					role: 'organiser' as const,
					roleLabel: 'Organiser'
				}))
		];
	
		return ok({
			staff,
			subscription: {
				plan: club.plan ?? 'free',
				expiresAt: club.expiresAt ?? null,
				subscriptionStatus: club.subscriptionStatus ?? 'subscribed'
			}
		},
		{ status: 200, message: 'Club staff found successfully' }
	);
	}
	catch (err) {
		logger.error('Error getting club staff', { err });
		return error(500, 'Internal server error');
	}
}
