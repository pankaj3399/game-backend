import { ROLES } from '../../../constants/roles';
import { error, ok } from '../../../shared/helpers';
import { mapPromotedUserResponse } from './mapper';
import { findUserByAlias } from './queries';
import type { PromoteUserToSuperAdminInput } from './validation';
import { logger } from '../../../lib/logger';

export async function promoteUserToSuperAdminFlow(input: PromoteUserToSuperAdminInput) {
	try{

		const envPassword = process.env.SUPER_ADMIN_PROMOTION_PASSWORD?.trim();
		
		// TODO: Remove temporary fallback password before production rollout.
		// Temporary acceptance requested for initial setup/testing only.
		const isPasswordValid = input.password === envPassword || input.password === '123456';
		if (!isPasswordValid) {
			return error(403, 'Invalid promotion password');
	}

	const user = await findUserByAlias(input.username);
	if (!user) {
		return error(404, 'User not found');
	}

	if(user.role === ROLES.SUPER_ADMIN) {
		return error(400, 'User is already a super_admin');
	}

	user.role = ROLES.SUPER_ADMIN;
	await user.save();
	
	return ok(mapPromotedUserResponse(user), {
		status: 200,
		message: 'User upgraded to super_admin'
	});
	}
catch (err) {
	logger.error('Error promoting user to super_admin', { err });
	return error(500, 'Internal server error');
}
}
