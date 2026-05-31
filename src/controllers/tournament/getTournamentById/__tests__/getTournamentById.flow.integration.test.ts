import { fetchTournamentById } from '../../shared/fetchTournamentById';
import { mapTournamentDetail } from '../mapper';
import {
	createClub,
	createCourt,
	createGame,
	createTournament,
	createUser,
	setupMemoryMongo,
} from '../../../../testUtils/db';

setupMemoryMongo();

describe('getTournamentById read path integration', () => {
	it('loads the detail populate graph and maps progress/permissions from real documents', async () => {
		const creator = await createUser();
		const participant = await createUser({ name: 'Alice', alias: 'ace' });
		const club = await createClub({ name: 'Populate Club', defaultAdminId: creator._id });
		await createCourt(club._id, { name: 'Centre Court' });
		const tournament = await createTournament({
			club: club._id,
			createdBy: creator._id,
			name: 'Populate Cup',
			participants: [participant._id],
			maxMember: 4,
		});
		await createGame({
			tournament: tournament._id,
			side1Players: [participant._id],
			side2Players: [(await createUser())._id],
			status: 'pendingScore',
		});

		const loaded = await fetchTournamentById(tournament._id.toString(), {
			participantIdForLeaveChecks: participant._id.toString(),
		});

		expect(loaded?.club?.name).toBe('Populate Club');
		expect(loaded?.club?.courts?.[0].name).toBe('Centre Court');
		expect(loaded?.participants?.[0]).toMatchObject({ name: 'Alice', alias: 'ace' });
		expect(loaded?.leaveBlockers).toEqual({
			hasPendingScoreMatches: true,
			hasUnfinishedMatches: false,
		});

		const response = mapTournamentDetail(
			loaded!,
			{
				isManager: false,
				isCreator: false,
				clubIdStr: club._id.toString(),
				role: 'player',
			},
			[],
			participant._id.toString(),
			loaded?.leaveBlockers
		);

		expect(response).toMatchObject({
			name: 'Populate Cup',
			club: { name: 'Populate Club' },
			progress: { spotsFilled: 1, spotsTotal: 4, percentage: 25 },
			permissions: { canJoin: false, canLeave: true, isParticipant: true },
		});
		expect(response.courts).toEqual([{ id: expect.any(String), name: 'Centre Court' }]);
	});
});
