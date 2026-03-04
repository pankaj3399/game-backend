import type { Request, Response } from 'express';
import User from '../../models/User';
import Court from '../../models/Court';

/**
 * GET /api/user/admin-clubs
 * Returns clubs the authenticated user administers (user.adminOf) with court count.
 * RBAC: Requires club_admin or super_admin role.
 */
export async function getAdminClubs(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const user = await User.findById(sessionUser._id)
		.populate({
			path: 'adminOf',
			select: '_id name',
			model: 'Club'
		})
		.select('adminOf')
		.lean()
		.exec();

	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	}

	const adminClubsRaw = user.adminOf as { _id: unknown; name?: string }[] | undefined;
	const clubList = (Array.isArray(adminClubsRaw) ? adminClubsRaw : []).filter(
		(c) => c && typeof c === 'object' && c.name != null
	);

	const clubIds = clubList.map((c) => c._id);
	const courtCounts = await Court.aggregate<{ _id: unknown; count: number }>([
		{ $match: { club: { $in: clubIds } } },
		{ $group: { _id: '$club', count: { $sum: 1 } } }
	]).exec();

	const countMap = new Map(
		courtCounts.map((r) => [r._id?.toString(), r.count])
	);

	const adminClubs = clubList.map((c) => ({
		id: c._id,
		name: c.name as string,
		courtCount: countMap.get((c._id as { toString?: () => string })?.toString?.() ?? '') ?? 0
	}));

	res.json({ clubs: adminClubs });
}
