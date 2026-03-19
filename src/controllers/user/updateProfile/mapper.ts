import type { UserMutationMessageResponse } from '../../../types/api/user';

export function mapUpdateProfileResponse(): UserMutationMessageResponse {
	return { message: 'Profile updated successfully' };
}
