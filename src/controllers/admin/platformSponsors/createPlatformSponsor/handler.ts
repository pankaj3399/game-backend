import { ok, error } from '../../../../shared/helpers';
import { mapPlatformSponsor } from '../shared/mapper';
import { createPlatformSponsorRecord } from '../shared/queries';
import type { CreatePlatformSponsorInput } from '../shared/validation';

export async function createPlatformSponsorFlow(input: CreatePlatformSponsorInput) {
	try{
		
		const sponsor = await createPlatformSponsorRecord(input);
		
		return ok(
			{
				sponsor: mapPlatformSponsor(sponsor)
			},
			{ status: 201, message: 'Platform sponsor created' }
		);
	} catch (err) {
		const mongoErr = err as { code?: number; name?: string };
		if (
			mongoErr.code === 11000 &&
			(mongoErr.name === 'MongoServerError' || mongoErr.name === 'MongoError')
		) {
			return error(409, 'Sponsor already exists');
		}
		return error(500, 'Internal server error');
	}
}