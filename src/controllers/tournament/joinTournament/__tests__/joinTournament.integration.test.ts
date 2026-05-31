import Tournament from '../../../../models/Tournament';
import { createTournament, createUser, setupMemoryMongo } from '../../../../testUtils/db';
import { joinTournamentFlow } from '../handler';

setupMemoryMongo();

describe('joinTournamentFlow() integration', () => {
	it('persists a participant when an active tournament has capacity', async () => {
		const existing = await createUser();
		const joining = await createUser();
		const tournament = await createTournament({
			participants: [existing._id],
			maxMember: 2,
		});

		const result = await joinTournamentFlow(tournament._id.toString(), joining);

		expect(result.ok).toBe(true);
		const persisted = await Tournament.findById(tournament._id).lean().orFail();
		expect(persisted.participants.map((id) => id.toString())).toContain(joining._id.toString());
		expect(persisted.participants).toHaveLength(2);
	});

	it('does not duplicate an existing participant', async () => {
		const player = await createUser();
		const tournament = await createTournament({
			participants: [player._id],
			maxMember: 2,
		});

		const result = await joinTournamentFlow(tournament._id.toString(), player);

		expect(result.ok).toBe(true);
		const persisted = await Tournament.findById(tournament._id).lean().orFail();
		expect(persisted.participants.filter((id) => id.toString() === player._id.toString())).toHaveLength(1);
	});

	it('rejects full or non-active tournaments without mutating participants', async () => {
		const player = await createUser();
		const waiting = await createUser();
		const fullTournament = await createTournament({
			participants: [player._id],
			maxMember: 1,
		});
		const draftTournament = await createTournament({
			status: 'draft',
			participants: [],
			maxMember: 8,
		});

		const fullResult = await joinTournamentFlow(fullTournament._id.toString(), waiting);
		const draftResult = await joinTournamentFlow(draftTournament._id.toString(), waiting);

		expect(fullResult).toMatchObject({ ok: false, status: 400 });
		expect(draftResult).toMatchObject({ ok: false, status: 400 });
		await expect(Tournament.findById(fullTournament._id).lean().orFail()).resolves.toMatchObject({
			participants: [player._id],
		});
		await expect(Tournament.findById(draftTournament._id).lean().orFail()).resolves.toMatchObject({
			participants: [],
		});
	});

});
