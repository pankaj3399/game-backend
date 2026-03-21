import { logger } from '../../../../lib/logger';
import { error, ok } from '../../../../shared/helpers';
import { mapPlatformSponsor } from '../shared/mapper';
import { findAllPlatformSponsors } from '../shared/queries';

export async function getPlatformSponsorsFlow() {
	try{
		const sponsors = await findAllPlatformSponsors();

	return ok(
		{
			sponsors: sponsors.map((sponsor) => mapPlatformSponsor(sponsor))
		},
		{ status: 200, message: 'Fetched platform sponsors' }
	);
	} catch (err) {
		logger.error('Error getting platform sponsors', { err });
		return error(500, 'Internal server error');
	}
}
