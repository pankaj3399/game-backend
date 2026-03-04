import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../../models/User';
import Club from '../../models/Club';

export type ClubStaffRole = 'default_admin' | 'admin' | 'organiser';

export interface ClubStaffMember {
	id: string;
	email: string;
	name: string | null;
	alias: string | null;
	role: ClubStaffRole;
	roleLabel: string;
}

/**
 * GET /api/clubs/:clubId/staff
 * Returns admins and organisers for a club. User must be admin of this club.
 */
export async function getClubStaff(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const clubId = Array.isArray(req.params.clubId) ? req.params.clubId[0] : req.params.clubId;
	if (!clubId || !mongoose.Types.ObjectId.isValid(clubId)) {
		res.status(400).json({ message: 'Invalid club ID' });
		return;
	}

	const isAdmin = sessionUser.adminOf?.some((id) => id.toString() === clubId);
	if (!isAdmin && sessionUser.role !== 'super_admin') {
		res.status(403).json({ message: 'You do not have permission to manage this club' });
		return;
	}

	const club = await Club.findById(clubId)
		.select('defaultAdminId organiserIds plan expiresAt subscriptionStatus')
		.lean()
		.exec();
	if (!club) {
		res.status(404).json({ message: 'Club not found' });
		return;
	}

	// Admins: users whose adminOf contains this club
	const admins = await User.find({ adminOf: clubId })
		.select('_id email name alias')
		.lean()
		.exec();

	const defaultAdminId = club.defaultAdminId?.toString() ?? null;
	const organiserIdsRaw = club.organiserIds ?? [];
	const organiserIdStrings = organiserIdsRaw.map((id: { toString?: () => string } | string) =>
		typeof id === 'string' ? id : id?.toString?.() ?? String(id)
	);

	// Organisers: users in club.organiserIds (exclude those who are also admins)
	const organiserUsers = organiserIdStrings.length
		? await User.find({ _id: { $in: organiserIdStrings } })
			.select('_id email name alias')
			.lean()
			.exec()
		: [];

	const adminIds = new Set(admins.map((a) => a._id.toString()));
	const staff: ClubStaffMember[] = [];

	// Add admins first (default admin first)
	const sortedAdmins = [...admins].sort((a, b) => {
		const aId = a._id.toString();
		const bId = b._id.toString();
		if (defaultAdminId === aId) return -1;
		if (defaultAdminId === bId) return 1;
		return 0;
	});

	for (const u of sortedAdmins) {
		const id = u._id.toString();
		const isDefault = id === defaultAdminId;
		staff.push({
			id,
			email: u.email,
			name: u.name ?? null,
			alias: u.alias ?? null,
			role: isDefault ? 'default_admin' : 'admin',
			roleLabel: isDefault ? 'Main Admin' : 'Admin'
		});
	}

	// Add organisers (exclude admins)
	for (const u of organiserUsers) {
		const id = u._id.toString();
		if (adminIds.has(id)) continue;
		staff.push({
			id,
			email: u.email,
			name: u.name ?? null,
			alias: u.alias ?? null,
			role: 'organiser',
			roleLabel: 'Organiser'
		});
	}

	res.json({
		staff,
		subscription: {
			plan: club.plan ?? 'free',
			expiresAt: club.expiresAt ?? null,
			subscriptionStatus: club.subscriptionStatus ?? 'subscribed'
		}
	});
}
