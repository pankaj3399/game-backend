import type { Request, Response } from 'express';
import User from '../../models/User';

/**
 * GET /api/users/search?q=
 * Search users by name, alias, or email. Requires club_admin or super_admin.
 * Used by club admins to find users to add as admin/organiser.
 */
export async function searchUsers(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	if (sessionUser.role !== 'club_admin' && sessionUser.role !== 'super_admin') {
		res.status(403).json({ message: 'Not authorized to search users' });
		return;
	}

	const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
	if (q.length < 2) {
		res.json({ users: [] });
		return;
	}

	const searchRegex = new RegExp(escapeRegex(q), 'i');
	const users = await User.find({
		$or: [
			{ name: searchRegex },
			{ alias: searchRegex },
			{ email: searchRegex }
		]
	})
		.select('_id email name alias')
		.limit(20)
		.lean()
		.exec();

	res.json({
		users: users.map((u) => ({
			id: u._id,
			email: u.email,
			name: u.name ?? null,
			alias: u.alias ?? null
		}))
	});
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
