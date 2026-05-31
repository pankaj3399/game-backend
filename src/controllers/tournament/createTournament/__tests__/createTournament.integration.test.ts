import Tournament from '../../../../models/Tournament';
import { createClub, createCourt, createUser, setupMemoryMongo } from '../../../../testUtils/db';
import { createTournamentFlow } from '../handler';

setupMemoryMongo();

const baseInput = {
	club: '',
	name: 'Spring Cup',
	logoUrl: null,
	sponsor: undefined,
	status: 'active' as const,
	tournamentMode: 'singleDay' as const,
	date: new Date('2026-01-15T00:00:00.000Z'),
	startTime: '09:00',
	endTime: '12:00',
	playMode: 'TieBreak10' as const,
	entryFee: 0,
	minMember: 2,
	maxMember: 8,
	totalRounds: 3,
	duration: 60,
	breakDuration: 0,
};

function buildInput(clubId: string, overrides: Partial<typeof baseInput> = {}) {
	return {
		...baseInput,
		club: clubId,
		...overrides,
	};
}

describe('createTournamentFlow() integration', () => {
	it('creates an active tournament for a club admin and persists derived fields', async () => {
		const admin = await createUser({ role: 'club_admin' });
		const club = await createClub({ defaultAdminId: admin._id });
		admin.adminOf = [club._id];
		await admin.save();
		await createCourt(club._id);

		const result = await createTournamentFlow(buildInput(club._id.toString()), admin);

		expect(result).toMatchObject({
			ok: true,
			status: 200,
			data: {
				tournament: {
					name: 'Spring Cup',
					status: 'active',
				},
			},
		});
		const persisted = await Tournament.findOne({ club: club._id, name: 'Spring Cup' }).lean().orFail();
		expect(persisted.createdBy.toString()).toBe(admin._id.toString());
		expect(persisted.timezone).toBe('Asia/Kolkata');
		expect(persisted.schedule).toBeDefined();
	});

	it('rejects an active tournament for a manageable club that has no courts', async () => {
		const admin = await createUser({ role: 'club_admin' });
		const club = await createClub({ defaultAdminId: admin._id });
		admin.adminOf = [club._id];
		await admin.save();

		const result = await createTournamentFlow(buildInput(club._id.toString()), admin);

		expect(result).toMatchObject({
			ok: false,
			status: 400,
			message: 'Selected club has no courts. Add at least one court before publishing this tournament.',
		});
		await expect(Tournament.findOne({ club: club._id, name: 'Spring Cup' }).lean()).resolves.toBeNull();
	});

	it('rejects a user who cannot manage the club before creating anything', async () => {
		const outsider = await createUser({ role: 'player' });
		const club = await createClub();
		await createCourt(club._id);

		const result = await createTournamentFlow(buildInput(club._id.toString()), outsider);

		expect(result).toMatchObject({
			ok: false,
			status: 403,
			message: 'You do not have permission to create tournaments for this club',
		});
		await expect(Tournament.findOne({ club: club._id, name: 'Spring Cup' }).lean()).resolves.toBeNull();
	});

	it('returns a business conflict when the club already has a tournament with the same name', async () => {
		const admin = await createUser({ role: 'club_admin' });
		const club = await createClub({ defaultAdminId: admin._id });
		admin.adminOf = [club._id];
		await admin.save();
		await createCourt(club._id);
		await createTournamentFlow(buildInput(club._id.toString()), admin);

		const result = await createTournamentFlow(buildInput(club._id.toString()), admin);

		expect(result).toMatchObject({
			ok: false,
			status: 409,
			message: 'A tournament with this name already exists in the selected club',
		});
		await expect(Tournament.countDocuments({ club: club._id, name: 'Spring Cup' })).resolves.toBe(1);
	});
});
