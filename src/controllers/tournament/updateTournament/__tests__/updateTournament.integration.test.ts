import { Router } from 'express';
import Tournament from '../../../../models/Tournament';
import { ROLES } from '../../../../constants/roles';
import authenticate from '../../../../middlewares/auth';
import { requireOrganiserOrAbove } from '../../../../middlewares/rbac';
import {
	createCourt,
	createSession,
	createTournament,
	createUser,
	seedClubAdmin,
	setupMemoryMongo,
} from '../../../../testUtils/db';
import { buildJsonApp, requestJson } from '../../../../testUtils/integrationTestUtils';
import { updateTournament } from '../index';

setupMemoryMongo();

function buildApp() {
	const router = Router();
	router.patch('/:id', authenticate, requireOrganiserOrAbove, updateTournament);
	return buildJsonApp('/tournaments', router);
}

describe('updateTournament route integration', () => {
	const app = buildApp();

	it('updates a tournament through auth, RBAC, validation, and Mongo persistence', async () => {
		const owner = await createUser({ role: ROLES.ORGANISER });
		const { authorization } = await createSession(owner);
		const { club } = await seedClubAdmin({ plan: 'premium' });
		const tournament = await createTournament({
			club: club._id,
			createdBy: owner._id,
			name: 'Original Tournament',
			status: 'draft',
			minMember: 2,
			maxMember: 8,
		});

		const result = await requestJson(app, `/tournaments/${tournament._id.toString()}`, {
			method: 'PATCH',
			headers: { authorization },
			body: {
				name: ' Updated Tournament ',
				entryFee: 25,
				minMember: 3,
				maxMember: 12,
				foodInfo: 'Snacks',
			},
		});

		expect(result.status).toBe(200);
		expect(result.body).toEqual({
			message: 'Tournament updated',
			tournament: expect.objectContaining({
				id: tournament._id.toString(),
				name: 'Updated Tournament',
				club: club._id.toString(),
				status: 'draft',
			}),
		});

		const persisted = await Tournament.findById(tournament._id).lean().orFail();
		expect(persisted).toMatchObject({
			name: 'Updated Tournament',
			entryFee: 25,
			minMember: 3,
			maxMember: 12,
			foodInfo: 'Snacks',
		});
	});

	it('rejects non-owner organisers without changing the tournament', async () => {
		const owner = await createUser({ role: ROLES.ORGANISER });
		const otherOrganiser = await createUser({ role: ROLES.ORGANISER });
		const { authorization } = await createSession(otherOrganiser);
		const tournament = await createTournament({
			createdBy: owner._id,
			name: 'Protected Tournament',
			status: 'draft',
		});

		await expect(
			requestJson(app, `/tournaments/${tournament._id.toString()}`, {
				method: 'PATCH',
				headers: { authorization },
				body: { name: 'Should Not Persist' },
			})
		).resolves.toEqual({
			status: 403,
			body: {
				message: 'You do not have permission to update this tournament',
				error: true,
			},
		});

		const unchanged = await Tournament.findById(tournament._id).lean().orFail();
		expect(unchanged.name).toBe('Protected Tournament');
	});

	it('rolls back publish when the selected club has no courts', async () => {
		const owner = await createUser({ role: ROLES.ORGANISER });
		const { authorization } = await createSession(owner);
		const { club: sourceClub } = await seedClubAdmin({ plan: 'premium' });
		await createCourt(sourceClub._id);
		const { club: targetClubWithoutCourts } = await seedClubAdmin({ plan: 'premium' });
		const tournament = await createTournament({
			club: sourceClub._id,
			createdBy: owner._id,
			status: 'draft',
			name: 'Publish Candidate',
			minMember: 2,
			maxMember: 8,
			totalRounds: 2,
		});
		owner.adminOf = [targetClubWithoutCourts._id];
		await owner.save();

		const result = await requestJson(app, `/tournaments/${tournament._id.toString()}`, {
			method: 'PATCH',
			headers: { authorization },
			body: {
				club: targetClubWithoutCourts._id.toString(),
				status: 'active',
				name: 'Published Candidate',
				date: '2026-02-15',
				startTime: '09:00',
				endTime: '12:00',
				playMode: 'TieBreak10',
				tournamentMode: 'singleDay',
				entryFee: 0,
				minMember: 2,
				maxMember: 8,
				totalRounds: 2,
				duration: 45,
				breakDuration: 5,
			},
		});

		expect(result.status).toBe(400);
		expect(result.body).toEqual({
			message: 'Selected club has no courts. Add at least one court before publishing this tournament.',
			error: true,
		});

		const unchanged = await Tournament.findById(tournament._id).lean().orFail();
		expect(unchanged.status).toBe('draft');
		expect(unchanged.name).toBe('Publish Candidate');
		expect(unchanged.club.toString()).toBe(sourceClub._id.toString());
	});
});
