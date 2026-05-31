import { isApplePlaceholderEmail } from '../passport';

describe('isApplePlaceholderEmail', () => {
	it('returns true for Apple noreply placeholder addresses', () => {
		expect(isApplePlaceholderEmail('apple-abc123@users.noreply.local')).toBe(true);
		expect(isApplePlaceholderEmail('apple-507f1f77bcf86cd799439011@users.noreply.local')).toBe(true);
	});

	it('returns false for regular email addresses', () => {
		expect(isApplePlaceholderEmail('user@example.com')).toBe(false);
	});

	it('returns false when prefix matches but suffix does not', () => {
		expect(isApplePlaceholderEmail('apple-user@example.com')).toBe(false);
	});

	it('returns false when suffix matches but prefix does not', () => {
		expect(isApplePlaceholderEmail('google-user@users.noreply.local')).toBe(false);
	});

	it('returns false for empty string', () => {
		expect(isApplePlaceholderEmail('')).toBe(false);
	});

	it('returns false for partial prefix only', () => {
		expect(isApplePlaceholderEmail('apple-')).toBe(false);
	});
});
