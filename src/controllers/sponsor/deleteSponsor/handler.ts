import Sponsor from '../../../models/Sponsor';
import { error, ok } from '../../../shared/helpers';

export async function deleteSponsorFlow(club: string, sponsorId: string) {
	const result = await Sponsor.deleteOne({
		_id: sponsorId,
		scope: 'club',
		club: club
	});

	if (result.deletedCount === 0) {
		return error(404, 'Sponsor not found');
	}

	return ok({}, { status: 204, message: 'Sponsor deleted' });
}
