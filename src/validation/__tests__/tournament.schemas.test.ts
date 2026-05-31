import {
	createDraftSchema,
	publishSchema,
	publishBodySchema,
	updateDraftSchema,
} from '../tournament.schemas';

const CLUB_ID = '507f1f77bcf86cd799439011';
const SPONSOR_ID = '507f1f77bcf86cd799439012';

const validPublishBase = {
	club: CLUB_ID,
	name: 'Summer Open',
	timezone: 'Asia/Kolkata',
	playMode: '3set' as const,
	tournamentMode: 'singleDay' as const,
	entryFee: 0,
	minMember: 4,
	maxMember: 8,
	totalRounds: 3,
	status: 'active' as const,
	date: new Date('2026-06-01'),
	startTime: '09:00',
	endTime: '18:00',
	duration: 60,
	breakDuration: 10,
};

describe('createDraftSchema', () => {
	it('requires club and name', () => {
		expect(createDraftSchema.safeParse({ club: CLUB_ID, name: 'Draft Cup' }).success).toBe(true);
		expect(createDraftSchema.safeParse({ club: CLUB_ID }).success).toBe(false);
	});

	it('rejects maxMember below minMember', () => {
		const result = createDraftSchema.safeParse({
			club: CLUB_ID,
			name: 'Bad',
			minMember: 8,
			maxMember: 4,
		});
		expect(result.success).toBe(false);
	});

	it('rejects end time before start time', () => {
		const result = createDraftSchema.safeParse({
			club: CLUB_ID,
			name: 'Bad times',
			startTime: '18:00',
			endTime: '09:00',
		});
		expect(result.success).toBe(false);
	});

	it('normalizes empty logoUrl to null', () => {
		const result = createDraftSchema.safeParse({
			club: CLUB_ID,
			name: 'Logo',
			logoUrl: '',
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.logoUrl).toBeNull();
		}
	});
});

describe('updateDraftSchema', () => {
	it('requires at least one field', () => {
		expect(updateDraftSchema.safeParse({}).success).toBe(false);
		expect(updateDraftSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
	});
});

describe('publishSchema', () => {
	it('accepts a complete single-day publish payload', () => {
		expect(publishSchema.safeParse(validPublishBase).success).toBe(true);
	});

	it('rejects invalid timezone', () => {
		const result = publishSchema.safeParse({ ...validPublishBase, timezone: 'Not/AZone' });
		expect(result.success).toBe(false);
	});

	it('requires date and times for singleDay mode', () => {
		const missingDate = publishSchema.safeParse({
			...validPublishBase,
			date: null,
		});
		expect(missingDate.success).toBe(false);

		const missingStart = publishSchema.safeParse({
			...validPublishBase,
			startTime: null,
		});
		expect(missingStart.success).toBe(false);
	});

	it('rejects duration not divisible by 5', () => {
		const result = publishSchema.safeParse({ ...validPublishBase, duration: 62 });
		expect(result.success).toBe(false);
	});

	it('allows null duration without coercing to zero', () => {
		const result = publishSchema.safeParse({ ...validPublishBase, duration: null });
		expect(result.success).toBe(true);
	});
});

describe('publishBodySchema', () => {
	it('strips unknown fields and allows partial publish fields', () => {
		const result = publishBodySchema.safeParse({
			name: 'Updated',
			extra: 'removed',
			entryFee: 10,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toEqual({ name: 'Updated', entryFee: 10 });
			expect('extra' in result.data).toBe(false);
		}
	});
});
