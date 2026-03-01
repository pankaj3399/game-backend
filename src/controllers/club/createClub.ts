import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Club from '../../models/Club';
import Court from '../../models/Court';
import User from '../../models/User';

export interface CreateClubBody {
	name: string;
	website?: string | null;
	bookingSystemUrl?: string | null;
	address: string;
	courts?: Array<{
		name: string;
		type: 'concrete' | 'clay' | 'hard' | 'grass' | 'carpet' | 'other';
		placement: 'indoor' | 'outdoor';
	}>;
}

/**
 * POST /api/clubs
 * Create a new club. Creator is added to user.adminOf.
 * RBAC: Requires club_admin or super_admin role.
 */
export async function createClub(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const body = req.body as CreateClubBody;
	const { name, website, bookingSystemUrl, address, courts = [] } = body;

	if (!name?.trim()) {
		res.status(400).json({ message: 'Club name is required' });
		return;
	}
	if (!address?.trim()) {
		res.status(400).json({ message: 'Address is required' });
		return;
	}

	const existing = await Club.findOne({ name: name.trim() }).select('_id').exec();
	if (existing) {
		res.status(409).json({ message: 'A club with this name already exists' });
		return;
	}

	const club = await Club.create({
		name: name.trim(),
		address: address.trim(),
		website: website?.trim() || null,
		bookingSystemUrl: bookingSystemUrl?.trim() || null,
		coordinates: { type: 'Point', coordinates: [0, 0] },
		defaultAdminId: sessionUser._id
	});

	const courtDocs = courts
		.filter((c) => c?.name?.trim())
		.map((c) => ({
			club: club._id,
			name: c.name.trim(),
			type: c.type || 'concrete',
			placement: c.placement || 'outdoor'
		}));

	if (courtDocs.length > 0) {
		await Court.insertMany(courtDocs);
	}

	const user = await User.findById(sessionUser._id);
	if (user) {
		user.adminOf.push(club._id);
		await user.save();
	}

	res.status(201).json({
		club: {
			id: club._id,
			name: club.name,
			address: club.address,
			website: club.website,
			bookingSystemUrl: club.bookingSystemUrl,
			courtCount: courtDocs.length
		}
	});
}
