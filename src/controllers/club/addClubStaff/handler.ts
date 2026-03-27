import mongoose from 'mongoose';
import type { Request } from 'express';
import type { AddClubStaffInput } from '../../../validation/club.schemas';
import { buildPermissionContext } from '../../../shared/authContext';
import { computeClubStaffPermissionsForActor } from '../../../shared/clubStaffPermissions';
import { error, ok } from '../../../shared/helpers';
import {
	addUserAdminOfClub,
	addUserAsClubOrganiser,
	findClubPlanById,
	findUserById
} from './queries';
import { isClubStaffMutationNotFoundError } from '../shared/queries';

type Session = NonNullable<Request['user']>;

export async function addClubStaffFlow(clubId: string, payload: AddClubStaffInput, session: Session) {
	const ctx = buildPermissionContext(session);
	const club = await findClubPlanById(clubId);
	if (!club) {
		return error(404, 'Club not found');
	}

	const access = computeClubStaffPermissionsForActor(
		{ defaultAdminId: club.defaultAdminId },
		clubId,
		{
			id: ctx.userId,
			role: ctx.userRole,
			adminOf: ctx.adminOf
		}
	);
	if (!access.ok) {
		return error(403, 'You do not have permission to manage this club');
	}

	if (payload.role === 'admin' && !access.canManageAdmins) {
		return error(403, 'Only the main admin can assign the admin role');
	}

	if (payload.role === 'organiser' && !access.canManageOrganisers) {
		return error(403, 'Only club admins can manage organisers');
	}

	if (club.plan === 'free') {
		return error(403, 'Cannot add admins or organisers on a free plan. Upgrade to premium.');
	}

	const targetUser = await findUserById(payload.userId);
	if (!targetUser) {
		return error(404, 'User not found');
	}

	const dbSession = await mongoose.startSession();
	try {
		return await dbSession.withTransaction(async () => {
			const latestClub = await findClubPlanById(clubId, dbSession);
			if (!latestClub) {
				return error(404, 'Club not found');
			}

			if (latestClub.plan === 'free') {
				return error(403, 'Cannot add admins or organisers on a free plan. Upgrade to premium.');
			}

			try {
				if (payload.role === 'admin') {
					const adminBranchClub = await findClubPlanById(clubId, dbSession);
					if (!adminBranchClub) {
						return error(404, 'Club not found');
					}
					if (adminBranchClub.plan === 'free') {
						return error(403, 'Cannot add admins or organisers on a free plan. Upgrade to premium.');
					}

					const result = await addUserAdminOfClub(clubId, payload.userId, dbSession);
					if (result.modifiedCount === 0) {
						return error(409, 'User is already an admin of this club');
					}
				} else {
					const result = await addUserAsClubOrganiser(clubId, payload.userId, dbSession);
					if (result.modifiedCount === 0) {
						return error(409, 'User is already an organiser of this club');
					}
				}
			} catch (err) {
				if (isClubStaffMutationNotFoundError(err)) {
					if (err.entity === 'club') {
						return error(404, 'Club not found');
					}
					return error(404, 'User not found');
				}
				throw err;
			}

			return ok(
				{
					message:
						payload.role === 'admin' ? 'Admin added successfully' : 'Organiser added successfully',
					staff: {
						id: targetUser._id.toString(),
						email: targetUser.email,
						name: targetUser.name ?? null,
						alias: targetUser.alias ?? null,
						role: payload.role,
						roleLabel: payload.role === 'admin' ? 'Admin' : 'Organiser'
					}
				},
				{ status: 201, message: 'Club staff added successfully' }
			);
		});
	} finally {
		await dbSession.endSession().catch(() => {});
	}
}
