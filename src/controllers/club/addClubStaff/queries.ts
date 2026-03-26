import Club from '../../../models/Club';
export {
	addUserAdminOfClub,
	addUserAsClubOrganiser,
	findUserById
} from '../shared/queries';

export async function findClubPlanById(clubId: string) {
	return Club.findById(clubId).select('plan').exec();
}
