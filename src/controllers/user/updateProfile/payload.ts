import type { UpdateProfileInput } from '../../../validation/user.schemas';

export function buildProfileUpdatePayload(input: UpdateProfileInput) {
	const updatePayload: Record<string, string | number | Date | null> = {};

	if (input.name !== undefined) {
		updatePayload.name = input.name.trim() || null;
	}

	if (input.alias !== undefined) {
		updatePayload.alias = input.alias.trim() || null;
	}

	if (input.dateOfBirth !== undefined) {
		updatePayload.dateOfBirth = input.dateOfBirth;
	}

	if (input.gender !== undefined) {
		updatePayload.gender = input.gender;
	}

	return updatePayload;
}
