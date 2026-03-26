import mongoose from 'mongoose';
import type { Request } from 'express';
import type { AddClubStaffInput } from '../../../validation/club.schemas';
import { userCanManageClub, userCanManageClubAsAdmin } from '../../../lib/permissions';
import { buildPermissionContext } from '../../../shared/authContext';
import { error, ok } from '../../../shared/helpers';
import { addUserAdminOfClub, addUserAsClubOrganiser, findClubPlanById, findUserById } from './queries';

type Session = NonNullable<Request['user']>;

export async function addClubStaffFlow(clubId: string, payload: AddClubStaffInput, session: Session) {
	const ctx = buildPermissionContext(session);
	if (!(await userCanManageClub(ctx, clubId))) {
		return error(403, 'You do not have permission to manage this club');
	}

	if (payload.role === 'admin' && !userCanManageClubAsAdmin(ctx, clubId)) {
		return error(403, 'Only club admins can add new admins');
	}

	const club = await findClubPlanById(clubId);
	if (!club) {
		return error(404, 'Club not found');
	}

	if (club.plan === 'free') {
		return error(403, 'Cannot add admins or organisers on a free plan. Upgrade to premium.');
	}

	const targetUser = await findUserById(payload.userId);
	if (!targetUser) {
		return error(404, 'User not found');
	}

	if (payload.role === 'admin') {
		const result = await addUserAdminOfClub(clubId, payload.userId);

		if (result.modifiedCount === 0) {
			return error(409, 'User is already an admin of this club');
		}
	} else {
		const result = await addUserAsClubOrganiser(clubId,payload.userId);

		if (result.modifiedCount === 0) {
			return error(409, 'User is already an organiser of this club');
		}
	}

	return ok(
		{
			message: payload.role === 'admin' ? 'Admin added successfully' : 'Organiser added successfully',
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
}
