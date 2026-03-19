type PromoteTargetUser = {
	_id: { toString(): string };
	email: string;
	name?: string | null;
	alias?: string | null;
	role: string;
};

export function mapPromotedUserResponse(user: PromoteTargetUser) {
	return {
		message: 'User upgraded to super_admin',
		user: {
			id: user._id.toString(),
			email: user.email,
			name: user.name ?? null,
			alias: user.alias ?? null,
			role: user.role
		}
	};
}
