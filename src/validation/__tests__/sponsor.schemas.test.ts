import { createSponsorSchema, updateSponsorSchema } from '../sponsor.schemas';

describe('createSponsorSchema', () => {
	it('requires name and normalizes empty link to null', () => {
		const result = createSponsorSchema.safeParse({
			name: 'Acme',
			link: '',
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.link).toBeNull();
		}
	});

	it('rejects missing name', () => {
		expect(createSponsorSchema.safeParse({ name: '' }).success).toBe(false);
	});
});

describe('updateSponsorSchema', () => {
	it('allows partial sponsor updates', () => {
		expect(updateSponsorSchema.safeParse({ status: 'active' }).success).toBe(true);
	});
});
