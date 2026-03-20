import { logger } from '../../../../lib/logger';
import { error, ok } from '../../../../shared/helpers';
import { deletePlatformSponsorRecord } from '../shared/queries';

export async function deletePlatformSponsorFlow(sponsorId: string) {
	try{
		const result = await deletePlatformSponsorRecord(sponsorId);

	if (result.deletedCount === 0) {
		return error(404, 'Sponsor not found');
	}

	return ok({}, { status: 204, message: 'Platform sponsor deleted' });
} catch (err) {
		logger.error('Error deleting platform sponsor', { err });
		return error(500, 'Internal server error');
	}	
}