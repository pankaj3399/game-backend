import {
	addClubStaffSchema,
	createClubSchema,
	setClubMainAdminSchema,
	updateClubSchema,
	updateClubStaffRoleSchema,
} from '../club.schemas';

const USER_ID = '507f1f77bcf86cd799439011';

describe('createClubSchema', () => {
	const valid = {
		name: 'Central Courts',
		address: '1 Main St',
		coordinates: [77.5946, 12.9716] as [number, number],
		courts: [{ name: 'Court A' }, { name: 'Court B' }],
	};

	it('accepts valid club input', () => {
		expect(createClubSchema.safeParse(valid).success).toBe(true);
	});

	it('rejects duplicate court names (case-insensitive)', () => {
		const result = createClubSchema.safeParse({
			...valid,
			courts: [{ name: 'Court A' }, { name: 'court a' }],
		});
		expect(result.success).toBe(false);
	});

	it('rejects coordinates outside valid ranges', () => {
		const result = createClubSchema.safeParse({
			...valid,
			coordinates: [200, 12],
		});
		expect(result.success).toBe(false);
	});
});

describe('updateClubSchema', () => {
	it('rejects duplicate courts on update', () => {
		const result = updateClubSchema.safeParse({
			courts: [{ name: 'A' }, { name: 'a' }],
		});
		expect(result.success).toBe(false);
	});

	it('accepts partial updates', () => {
		expect(updateClubSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
	});
});

describe('club staff schemas', () => {
	it('validates addClubStaff roles', () => {
		expect(
			addClubStaffSchema.safeParse({ userId: USER_ID, role: 'organiser' }).success,
		).toBe(true);
		expect(
			addClubStaffSchema.safeParse({ userId: USER_ID, role: 'invalid' }).success,
		).toBe(false);
	});

	it('validates updateClubStaffRole', () => {
		expect(updateClubStaffRoleSchema.safeParse({ role: 'admin' }).success).toBe(true);
	});

	it('validates setClubMainAdmin', () => {
		expect(setClubMainAdminSchema.safeParse({ userId: USER_ID }).success).toBe(true);
	});
});
