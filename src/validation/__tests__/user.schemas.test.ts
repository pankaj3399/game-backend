import { addFavoriteClubSchema, setHomeClubSchema, updateProfileSchema } from '../user.schemas';

const CLUB_ID = '507f1f77bcf86cd799439011';

describe('updateProfileSchema', () => {
	it('allows partial profile updates', () => {
		const parsed = updateProfileSchema.safeParse({ alias: 'new-alias' });
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.alias).toBe('new-alias');
		}
	});

	it('maps empty profile picture to null', () => {
		const result = updateProfileSchema.safeParse({ profilePictureUrl: '' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.profilePictureUrl).toBeNull();
		}
	});

	it('rejects invalid profile picture URLs', () => {
		expect(updateProfileSchema.safeParse({ profilePictureUrl: 'not-a-url' }).success).toBe(false);
	});

	it('transforms dateOfBirth string and clears gender', () => {
		const result = updateProfileSchema.safeParse({
			dateOfBirth: '1992-03-10',
			gender: '',
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.dateOfBirth).toBeInstanceOf(Date);
			expect(result.data.gender).toBeNull();
		}
	});

	it('leaves dateOfBirth undefined when omitted', () => {
		const result = updateProfileSchema.safeParse({ alias: 'only-alias' });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.dateOfBirth).toBeUndefined();
		}
	});
});

describe('favorite and home club schemas', () => {
	it('validates addFavoriteClub club id', () => {
		expect(addFavoriteClubSchema.safeParse({ club: CLUB_ID }).success).toBe(true);
		expect(addFavoriteClubSchema.safeParse({ club: 'bad-id' }).success).toBe(false);
	});

	it('validates setHomeClub club id', () => {
		expect(setHomeClubSchema.safeParse({ club: CLUB_ID }).success).toBe(true);
		expect(setHomeClubSchema.safeParse({ club: 'bad-id' }).success).toBe(false);
	});
});
