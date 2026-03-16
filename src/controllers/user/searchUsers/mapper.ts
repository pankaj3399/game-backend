
type SearchUserDoc = {
	_id: { toString(): string };
	email: string;
	name: string | null;
	alias: string | null;
};

export function mapSearchUsersResponse(users: SearchUserDoc[]) {
	return {
		users: users.map((user) => ({
			id: user._id.toString(),
			email: user.email,
			name: user.name ?? null,
			alias: user.alias ?? null
		}))
	};
}
