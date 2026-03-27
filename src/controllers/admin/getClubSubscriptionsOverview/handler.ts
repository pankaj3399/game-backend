import { logger } from '../../../lib/logger';
import { error, ok } from '../../../shared/helpers';
import { mapClubSubscriptionOverviewItem } from './mapper';
import { findClubsForSubscriptionsOverview } from './queries';

export async function getClubSubscriptionsOverviewFlow() {
	try {
		const { clubs, memberCountByClubId } = await findClubsForSubscriptionsOverview();

		return ok(
			{
				clubs: clubs.map((club) =>
					mapClubSubscriptionOverviewItem(club, memberCountByClubId.get(club._id.toString()) ?? 0)
				)
			},
			{ status: 200, message: 'Fetched club subscriptions overview' }
		);
	} catch (err) {
		logger.error('Error getting club subscriptions overview', { err });
		return error(500, 'Internal server error');
	}
}