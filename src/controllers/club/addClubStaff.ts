import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../../models/User';
import Club from '../../models/Club';

/**
 * POST /api/clubs/:clubId/staff
 * Add a user as admin or organiser. Requester must be admin of club or super_admin.
 * Body: { userId: string, role: 'admin' | 'organiser' }
 */
export async function addClubStaff(req: Request, res: Response) {
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

	const body = req.body as { userId?: string; role?: string };
	const { userId, role } = body;

	if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
		res.status(400).json({ message: 'Valid userId is required' });
		return;
	}

	if (role !== 'admin' && role !== 'organiser') {
		res.status(400).json({ message: 'Role must be "admin" or "organiser"' });
		return;
	}

	const club = await Club.findById(clubId).exec();
	if (!club) {
		res.status(404).json({ message: 'Club not found' });
		return;
	}

	const targetUser = await User.findById(userId).exec();
	if (!targetUser) {
		res.status(404).json({ message: 'User not found' });
		return;
	}

	if (role === 'admin') {
		if (targetUser.adminOf.some((id) => id.toString() === clubId)) {
			res.status(409).json({ message: 'User is already an admin of this club' });
			return;
		}
		targetUser.adminOf.push(club._id);
		await targetUser.save();
	} else {
		const organiserIds = club.organiserIds ?? [];
		if (organiserIds.some((id) => id.toString() === userId)) {
			res.status(409).json({ message: 'User is already an organiser of this club' });
			return;
		}
		organiserIds.push(new mongoose.Types.ObjectId(userId));
		club.organiserIds = organiserIds;
		await club.save();
	}

	res.status(201).json({
		message: role === 'admin' ? 'Admin added successfully' : 'Organiser added successfully',
		staff: {
			id: targetUser._id.toString(),
			email: targetUser.email,
			name: targetUser.name ?? null,
			alias: targetUser.alias ?? null,
			role: role === 'admin' ? 'admin' : 'organiser',
			roleLabel: role === 'admin' ? 'Admin' : 'Organiser'
		}
	});
}
