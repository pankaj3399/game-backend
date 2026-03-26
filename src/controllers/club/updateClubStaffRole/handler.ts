import type { UpdateClubStaffRoleInput } from '../../../validation/club.schemas';
import { ok } from '../../../shared/helpers';
import type { UpdateClubStaffRoleAccess } from './authenticate';
import { updateClubStaffRoleAtomic } from './queries';

export async function updateClubStaffRoleFlow(
	clubId: string,
	staffId: string,
	payload: UpdateClubStaffRoleInput,
	access: UpdateClubStaffRoleAccess
) {
	const atomic = await updateClubStaffRoleAtomic(clubId, staffId, payload, access);
	if (!atomic.ok) {
		return atomic;
	}

	const user = atomic.user;
	return ok(
		{
			message: 'Staff role updated successfully',
			staff: {
				id: user._id.toString(),
				email: user.email,
				name: user.name ?? null,
				alias: user.alias ?? null,
				role: payload.role,
				roleLabel: payload.role === 'admin' ? 'Admin' : 'Organiser'
			}
		},
		{ status: 200, message: 'Club staff updated successfully' }
	);
}
