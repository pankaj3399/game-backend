import { createTournamentSchema } from '../validation';

const CLUB_ID = '507f1f77bcf86cd799439011';

const activeSingleDay = {
	status: 'active' as const,
	tournamentMode: 'singleDay' as const,
	club: CLUB_ID,
	name: 'Open',
	playMode: '3set' as const,
	entryFee: 0,
	minMember: 4,
	maxMember: 8,
	totalRounds: 3,
	date: new Date('2026-07-01'),
	startTime: '10:00',
	endTime: '16:00',
};

describe('createTournamentSchema', () => {
	it('accepts active single-day tournament', () => {
		expect(createTournamentSchema.safeParse(activeSingleDay).success).toBe(true);
	});

	it('accepts draft unscheduled tournament without totalRounds', () => {
		const result = createTournamentSchema.safeParse({
			status: 'draft',
			tournamentMode: 'unscheduled',
			club: CLUB_ID,
			name: 'Draft',
		});
		expect(result.success).toBe(true);
	});

	it('requires totalRounds when status is active', () => {
		const { totalRounds: _removed, ...withoutRounds } = activeSingleDay;
		const result = createTournamentSchema.safeParse(withoutRounds);
		expect(result.success).toBe(false);
	});

	it('rejects conflicting sponsor and sponsorId', () => {
		const sponsor = '507f1f77bcf86cd799439012';
		const result = createTournamentSchema.safeParse({
			...activeSingleDay,
			sponsor,
			sponsorId: '507f1f77bcf86cd799439099',
		});
		expect(result.success).toBe(false);
	});

	it('merges sponsorId into sponsor on success', () => {
		const sponsorId = '507f1f77bcf86cd799439012';
		const result = createTournamentSchema.safeParse({
			...activeSingleDay,
			sponsorId,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.sponsor).toBe(sponsorId);
			expect('sponsorId' in result.data).toBe(false);
		}
	});

	it('rejects start time after end time for active singleDay', () => {
		const result = createTournamentSchema.safeParse({
			...activeSingleDay,
			startTime: '18:00',
			endTime: '09:00',
		});
		expect(result.success).toBe(false);
	});
});
