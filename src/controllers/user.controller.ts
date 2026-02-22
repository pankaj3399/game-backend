/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { LogError } from '../utils/logs';
import {
	IAddClub,
	IAddFavoriteClub,
	IAddTournament,
	IParticipate,
	ITournamentTiming,
	IUpdateProfile
} from '../types/types';
import mongoErrorHandler from '../utils/mongoErrorHandler';
import Club from '../models/club';
import Court from '../models/court';
import mongoose from 'mongoose';
import Tournament from '../models/tournament';
import Game, { IGame } from '../models/game';
import Favorite from '../models/favorite';
import Schedule, { IRound, ISchedule } from '../models/schedule';
import { Glicko2 } from 'glicko2';

import { formatDateTime, pairPlayers, assignCourtsToGames } from '../lib/scheduler';
import User, { IUser } from '../models/user';
import swiss from '../lib/swiss';

interface IRequest extends Request {
	user?: IUser;
}

type Player = {
	id: string; // User ID
	name: string; // User name
	elo: number; // Player's ELO ranking or order
};

type Court = {
	name: string;
	_id: string;
	startTime?: Date; // Make sure startTime is a Date, not number
	slot?: number;
};

// type Game = {
// 	player1: Player;
// 	player2: Player;
// 	court: Court;
// 	startTime: Date;
// 	slot: number;
// };

export const getUserProfile = async (req: IRequest, res: Response) => {
	try {
		// Access the user object
		const user = req.user;
		if (!user) {
			return res.status(404).json({ message: 'User not found' });
		}
		// Return user profile
		res.status(200).json({ user });
	} catch (error: any) {
		LogError(__dirname, 'POST', req.originalUrl, error);
		res.status(500).json({ message: error.message, code: 'PROFILE_FETCH_FAILED', error: true });
	}
};

export const updateUserProfile = async (req: IRequest, res: Response) => {
	const data: IUpdateProfile = req.body;
	if (!data?.alias) return res.status(400).json({ message: 'Alias is required', error: true, code: 'WARNING' });
	if (!data?.name) return res.status(400).json({ message: 'Name is required', error: true, code: 'WARNING' });
	if (!data?.dateOfBirth)
		return res.status(400).json({ message: 'Date of birth is required', error: true, code: 'WARNING' });
	if (!data?.gender) return res.status(400).json({ message: 'Gender is required', error: true, code: 'WARNING' });
	try {
		await User.findByIdAndUpdate(req?.user?._id, {
			alias: data?.alias,
			name: data?.name,
			dateOfBirth: data?.dateOfBirth,
			gender: data?.gender
		});
		res.status(200).json({ message: 'Profile updated', code: 'PROFILE_UPDATED', error: false });
	} catch (error: any) {
		LogError(__dirname, 'POST', req.originalUrl, error);
		res.status(500).json({ message: error.message, code: 'FAILED_UPDATE_PROFILE', error: true });
	}
};

export const deleteUserProfile = async (req: IRequest, res: Response) => {
	try {
		await User.findByIdAndUpdate(req?.user?._id, {
			googleId: req?.user?.googleId ? `deleted-${req?.user?.googleId}` : req?.user?.googleId,
			appleId: req?.user?.appleId ? `deleted-${req?.user?.appleId}` : req?.user?.appleId,
			email: `deleted-${req?.user?.email}`,
			alias: `deleted-${req?.user?.alias}`,
			name: `deleted-${req?.user?.alias}`
		});
		res.status(200).json({ message: 'Profile deleted', code: 'PROFILE_DELETED', error: false });
	} catch (error: any) {
		LogError(__dirname, 'POST', req.originalUrl, error);
		res.status(500).json({ message: error.message, code: 'FAILED_PROFILE_DELETION', error: true });
	}
};

export const addClub = async (req: IRequest, res: Response) => {
	const data: IAddClub = req.body;

	// Input validation
	if (!data?.name) {
		return res.status(400).json({ messages: ['Club Name is required'], error: true, code: 'WARNING' });
	}
	if (!data?.address) {
		return res.status(400).json({ messages: ['Club address is required'], error: true, code: 'WARNING' });
	}
	if (
		!data?.coordinates ||
		typeof data.coordinates.longitude !== 'number' ||
		typeof data.coordinates.latitude !== 'number'
	) {
		return res.status(400).json({ messages: ['Valid coordinates are required'], error: true, code: 'WARNING' });
	}
	if (!data?.courts || data?.courts.length === 0) {
		return res.status(400).json({ messages: ['At least one court is required.'], error: true, code: 'WARNING' });
	}

	// Validate unique court names within the same placement
	const placementMap: Record<string, Set<string>> = {
		indoor: new Set(),
		outdoor: new Set()
	};

	for (const court of data.courts) {
		if (!placementMap[court.placement]) {
			return res.status(400).json({ messages: ['Invalid court placement'], error: true, code: 'WARNING' });
		}
		if (placementMap[court.placement].has(court.name)) {
			return res.status(400).json({
				messages: [`Court names must be unique within the same placement (${court.placement})`],
				error: true,
				code: 'WARNING'
			});
		}
		placementMap[court.placement].add(court.name);
	}

	// Transactional operation
	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		// Check for an existing club with the same name
		const existingClub = await Club.findOne({ name: data.name });
		if (existingClub) {
			return res.status(400).json({
				messages: ['Club name already exists'],
				error: true,
				code: 'DUPLICATE_NAME'
			});
		}

		// Create the club
		const reqData = {
			name: data?.name,
			address: data?.address,
			coordinates: {
				type: 'Point',
				coordinates: [data?.coordinates?.longitude, data?.coordinates?.latitude]
			},
			website: data?.website,
			courts: data?.courts
		};
		const club = await Club.create([{ ...reqData, user: req?.user?._id }], { session });

		// Prepare court data
		const clubId = club[0]._id;
		const courtData = data.courts.map((court) => ({
			club: clubId,
			name: court.name,
			courtType: court.courtType,
			placement: court.placement
		}));

		// Insert courts
		await Court.insertMany(courtData, { session });

		// Commit transaction
		await session.commitTransaction();
		session.endSession();

		return res.status(200).json({
			messages: ['Club added successfully'],
			error: false,
			code: 'CLUB_ADDED',
			data: {
				club: club[0],
				courts: courtData
			}
		});
	} catch (error) {
		// Abort transaction on failure
		await session.abortTransaction();
		session.endSession();

		// Handle error
		const errorHandler: any = mongoErrorHandler(error);
		return res.status(errorHandler?.status).json({ messages: errorHandler?.messages, error: true, code: 'ERROR' });
	}
};

export const editClub = async (req: IRequest, res: Response) => {
	const id = req.params.id;
	const data: IAddClub = req.body;

	// Check if club ID is provided
	if (!id) {
		return res.status(400).json({ messages: ['Club ID is required'], error: true, code: 'WARNING' });
	}

	// Check if the club ID is a valid ObjectId
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(400).json({ messages: ['Invalid club ID provided'], error: true, code: 'ERROR' });
	}

	// Input validation
	if (!data?.name) {
		return res.status(400).json({ messages: ['Club Name is required'], error: true, code: 'WARNING' });
	}
	if (!data?.address) {
		return res.status(400).json({ messages: ['Club address is required'], error: true, code: 'WARNING' });
	}
	if (
		!data?.coordinates ||
		typeof data.coordinates.longitude !== 'number' ||
		typeof data.coordinates.latitude !== 'number'
	) {
		return res.status(400).json({ messages: ['Valid coordinates are required'], error: true, code: 'WARNING' });
	}
	if (!data?.courts || data?.courts.length === 0) {
		return res.status(400).json({ messages: ['At least one court is required.'], error: true, code: 'WARNING' });
	}

	// Validate unique court names within the same placement
	const placementMap: Record<string, Set<string>> = {
		indoor: new Set(),
		outdoor: new Set()
	};

	for (const court of data.courts) {
		if (!placementMap[court.placement]) {
			return res.status(400).json({ messages: ['Invalid court placement'], error: true, code: 'WARNING' });
		}
		if (placementMap[court.placement].has(court.name)) {
			return res.status(400).json({
				messages: [`Court names must be unique within the same placement (${court.placement})`],
				error: true,
				code: 'WARNING'
			});
		}
		placementMap[court.placement].add(court.name);
	}

	// Start a transaction
	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		// Update club details
		const club = await Club.findByIdAndUpdate(
			id,
			{
				name: data.name,
				address: data.address,
				coordinates: {
					type: 'Point',
					coordinates: [data.coordinates?.longitude, data.coordinates?.latitude]
				},
				website: data.website || null
			},
			{ new: true, session }
		);

		if (!club) {
			return res.status(404).json({ messages: ['Club not found'], error: true, code: 'ERROR' });
		}

		// Remove existing courts for the club
		await Court.deleteMany({ club: id }, { session });

		// Prepare and insert updated courts
		const courtData = data.courts.map((court) => ({
			club: id,
			name: court.name,
			courtType: court.courtType,
			placement: court.placement
		}));

		await Court.insertMany(courtData, { session });

		// Commit transaction
		await session.commitTransaction();
		session.endSession();

		return res.status(200).json({
			messages: ['Club updated successfully'],
			error: false,
			code: 'CLUB_UPDATED'
		});
	} catch (error: any) {
		// Abort transaction on failure
		await session.abortTransaction();
		session.endSession();

		// Handle error
		const errorHandler: any = mongoErrorHandler(error);
		return res.status(errorHandler?.status || 500).json({
			messages: errorHandler?.messages || ['Server error'],
			error: true,
			code: 'ERROR'
		});
	}
};

export const getClubs = async (req: IRequest, res: Response) => {
	try {
		// Extract pagination parameters
		const page = parseInt(req.query.page as string, 10) || 1; // Default to page 1
		const limit = parseInt(req.query.limit as string, 10) || 10; // Default to 10 items per page
		const skip = (page - 1) * limit;

		// Fetch clubs with pagination and sort by createdAt descending
		const clubs = await Club.find({ user: req?.user?._id, status: 'active' }) // Filter by the user's ID
			.populate('courts', 'name courtType placement') // Populate courts with selected fields
			.sort({ createdAt: -1 }) // Sort by createdAt in descending order to get the latest first
			.skip(skip) // Skip items for the current page
			.limit(limit) // Limit the number of items per page
			.exec();

		// Get the total count of clubs for pagination metadata
		const totalClubs = await Club.countDocuments({ user: req?.user?._id, status: 'active' });

		res.status(200).json({
			clubs,
			pagination: {
				total: totalClubs,
				page,
				limit,
				totalPages: Math.ceil(totalClubs / limit)
			},
			error: false,
			code: 'CLUB_FETCHED'
		});
	} catch (error: any) {
		LogError(__dirname, 'GET', req.originalUrl, error);
		res.status(500).json({ messages: [error.message], code: 'FAILED_FETCH_CLUBS', error: true });
	}
};

export const archiveClub = async (req: IRequest, res: Response) => {
	const id = req.params.id;
	try {
		if (!id) return res.status(400).json({ messages: ['Club id is required'], error: true, code: 'WARNING' });

		// Check if club ID is a valid ObjectId
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ messages: ['Invalid club id provided'], error: true, code: 'ERROR' });
		}

		// Archive the club
		const club = await Club.findByIdAndUpdate(id, { status: 'archive' }, { new: true });

		if (!club) {
			return res.status(404).json({ messages: ['Club not found'], error: true, code: 'ERROR' });
		}

		// Inactivate all tournaments linked to the club
		await Tournament.updateMany(
			{ club: id }, // Match tournaments by the club id
			{ status: 'inactive' } // Set the status of linked tournaments to 'inactive'
		);

		res
			.status(200)
			.json({ messages: ['Club archived and linked tournaments inactivated'], error: false, code: 'CLUB_ARCHIVED' });
	} catch (error: any) {
		LogError(__dirname, 'GET', req.originalUrl, error);
		res.status(500).json({ messages: [error.message], code: 'FAILED_FETCH_CLUBS', error: true });
	}
};

export const clubDropdown = async (req: IRequest, res: Response) => {
	try {
		// Fetch clubs with pagination
		const clubs = await Club.find({ user: req?.user?._id, status: 'active' }).select('_id name').exec();

		res.status(200).json({
			clubs,
			error: false,
			code: 'DROPDOWN_CLUB_FETCHED'
		});
	} catch (error: any) {
		LogError(__dirname, 'GET', req.originalUrl, error);
		res.status(500).json({ messages: [error.message], code: 'FAILED_FETCH_DROPDOWN_CLUBS', error: true });
	}
};

export const addFavoriteClub = async (req: IRequest, res: Response) => {
	const data: IAddFavoriteClub = req.body;

	if (!data?.club) {
		return res.status(400).json({
			messages: ['Club is required'],
			error: true,
			code: 'WARNING'
		});
	}

	if (!mongoose.Types.ObjectId.isValid(data?.club)) {
		return res.status(400).json({
			messages: ['Invalid club ID provided'],
			error: true,
			code: 'ERROR'
		});
	}

	// Check if the club is already in the user's favorites
	try {
		const existingFavorite = await Favorite.findOne({ user: req?.user?._id, club: data?.club });
		if (existingFavorite) {
			return res.status(400).json({
				messages: ['Club is already in your favorites'],
				error: true,
				code: 'DUPLICATE_FAVORITE'
			});
		}
	} catch (error) {
		return res.status(500).json({
			messages: ['Failed to check existing favorites'],
			error: true,
			code: 'ERROR'
		});
	}

	// Transactional operation
	const session = await mongoose.startSession();
	session.startTransaction();
	try {
		await Favorite.create([{ user: req?.user?._id, club: data?.club }], { session });

		// Commit transaction
		await session.commitTransaction();
		session.endSession();

		return res.status(200).json({
			messages: ['Club added to favorites'],
			error: false,
			code: 'FAVORITE_CLUB_ADDED'
		});
	} catch (error) {
		// Abort transaction on failure
		await session.abortTransaction();
		session.endSession();

		// Handle error
		const errorHandler: any = mongoErrorHandler(error);
		return res.status(errorHandler?.status).json({
			messages: errorHandler?.messages,
			error: true,
			code: 'ERROR'
		});
	}
};

export const getFavoriteClubs = async (req: IRequest, res: Response) => {
	try {
		const clubs = await Favorite.find({ user: req?.user?._id }).populate('club').exec();

		res.status(200).json({
			clubs,
			error: false,
			code: 'FAVORITE_CLUB_FETCHED'
		});
	} catch (error: any) {
		LogError(__dirname, 'GET', req.originalUrl, error);
		res.status(500).json({ messages: [error.message], code: 'FAILED_FETCH_FAVORITE_CLUBS', error: true });
	}
};

// Helper function to validate time format (HH:mm)
const isValidTime = (time: string): boolean => {
	const timeRegex = /^([0-1]\d|2[0-3]):([0-5]\d)$/; // Matches 00:00 to 23:59
	return timeRegex.test(time);
};

// Helper function to convert time to minutes since midnight
const timeToMinutes = (time: string): number => {
	const [hours, minutes] = time.split(':').map(Number);
	return hours * 60 + minutes;
};

export const addTournament = async (req: IRequest, res: Response) => {
	const data: IAddTournament = req.body;

	// Validation checks
	if (!data?.club) {
		return res.status(400).json({ messages: ['Please choose a linked club'], error: true, code: 'WARNING' });
	}
	if (!mongoose.Types.ObjectId.isValid(data?.club)) {
		return res.status(400).json({ messages: ['Invalid club id provided'], error: true, code: 'ERROR' });
	}
	if (!data?.name) {
		return res.status(400).json({ messages: ['Tournament name is required'], error: true, code: 'WARNING' });
	}
	// if (!data?.logo) {
	// 	return res.status(400).json({ messages: ['Logo is required'], error: true, code: 'WARNING' });
	// }
	if (!data?.tournamentMode) {
		return res.status(400).json({ messages: ['Tournament type is required'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'period' && data?.roundTimings?.length === 0) {
		return res.status(400).json({ messages: ['Rounds timing is required.'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'period' && data?.roundTimings?.length !== Number(data?.numberOfRounds)) {
		return res.status(400).json({ messages: ['Please add timing for all rounds'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && !data?.date) {
		return res.status(400).json({ messages: ['Tournament date is required'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && (!data?.startTime || !isValidTime(data.startTime))) {
		return res
			.status(400)
			.json({ messages: ['Invalid or missing tournament start time'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && (!data?.endTime || !isValidTime(data.endTime))) {
		return res.status(400).json({ messages: ['Invalid or missing tournament end time'], error: true, code: 'WARNING' });
	}
	// Check if start time is before end time
	if (data?.tournamentMode === 'singleDay' && timeToMinutes(data.startTime) >= timeToMinutes(data.endTime)) {
		return res.status(400).json({ messages: ['Start time must be before end time'], error: true, code: 'WARNING' });
	}
	// if (!data?.playMode) {
	// 	return res.status(400).json({ messages: ['Play mode is required'], error: true, code: 'WARNING' });
	// }
	// if (!data?.memberFee) {
	// 	return res.status(400).json({ messages: ['Member fee is required'], error: true, code: 'WARNING' });
	// }
	if (!data?.externalFee) {
		return res.status(400).json({ messages: ['External fee is required'], error: true, code: 'WARNING' });
	}
	if (!data?.minMember) {
		return res.status(400).json({ messages: ['Minimum number of members is required'], error: true, code: 'WARNING' });
	}
	if (!data?.maxMember) {
		return res.status(400).json({ messages: ['Maximum number of members is required'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && !data?.playTime) {
		return res.status(400).json({ messages: ['Playing time is required'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && !data?.pauseTime) {
		return res.status(400).json({ messages: ['Game pause time is required'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && (!data?.courts || data?.courts?.length <= 0)) {
		return res
			.status(400)
			.json({ messages: ['At-least one court is required, please select one.'], error: true, code: 'WARNING' });
	}
	if (!data?.numberOfRounds) {
		return res.status(400).json({ messages: ['Number of rounds are required'], error: true, code: 'WARNING' });
	}
	if (!data?.foodInfo) {
		return res.status(400).json({ messages: ['Food and drink info is required'], error: true, code: 'WARNING' });
	}
	if (!data?.descriptionInfo) {
		return res
			.status(400)
			.json({ messages: ['Tournament description info is required'], error: true, code: 'WARNING' });
	}

	// Transactional operation
	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		await Tournament.create([data], { session });

		// Commit transaction
		await session.commitTransaction();
		session.endSession();

		return res.status(200).json({
			messages: ['Tournament added successfully'],
			error: false,
			code: 'TOURNAMENT_ADDED'
		});
	} catch (error) {
		// Abort transaction on failure
		await session.abortTransaction();
		session.endSession();

		// Handle error
		const errorHandler: any = mongoErrorHandler(error);
		return res.status(errorHandler?.status).json({ messages: errorHandler?.messages, error: true, code: 'ERROR' });
	}
};

export const activateFavoriteClub = async (req: IRequest, res: Response) => {
	const id = req.params.id;

	try {
		if (!id) {
			return res.status(400).json({
				messages: ['Favorite club ID is required'],
				error: true,
				code: 'WARNING'
			});
		}

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				messages: ['Invalid favorite club ID provided'],
				error: true,
				code: 'ERROR'
			});
		}

		// Find the favorite club by ID
		const favoriteClub = await Favorite.findById(id);
		if (!favoriteClub) {
			return res.status(404).json({
				messages: ['Favorite club not found'],
				error: true,
				code: 'NOT_FOUND'
			});
		}

		// Use a session for atomic operations
		const session = await mongoose.startSession();
		session.startTransaction();

		try {
			// Inactivate all other favorite clubs for the user
			await Favorite.updateMany({ user: favoriteClub.user, _id: { $ne: id } }, { status: 'inactive' }, { session });

			// Activate the selected favorite club
			await Favorite.findByIdAndUpdate(id, { status: 'active' }, { session });

			// Commit the transaction
			await session.commitTransaction();
			session.endSession();

			res.status(200).json({
				messages: ['Club activated'],
				error: false,
				code: 'FAVORITE_CLUB_ACTIVATED'
			});
		} catch (error) {
			// Abort transaction on failure
			await session.abortTransaction();
			session.endSession();

			throw error; // Let the outer catch handle it
		}
	} catch (error: any) {
		LogError(__dirname, 'POST', req.originalUrl, error);
		res.status(500).json({
			messages: [error.message],
			code: 'FAILED_FAVORITE_CLUB_ACTIVATION',
			error: true
		});
	}
};

export const deleteFavoriteClub = async (req: IRequest, res: Response) => {
	const id = req.params.id;
	try {
		// Validate ID
		if (!id) {
			return res.status(400).json({
				messages: ['Favorite club ID is required'],
				error: true,
				code: 'WARNING'
			});
		}

		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({
				messages: ['Invalid favorite club ID provided'],
				error: true,
				code: 'ERROR'
			});
		}
		// Attempt to delete the favorite club
		const deletedFavorite = await Favorite.findByIdAndDelete(id);

		// If no club was found with the given ID
		if (!deletedFavorite) {
			return res.status(404).json({
				messages: ['Favorite club not found'],
				error: true,
				code: 'NOT_FOUND'
			});
		}
		// Successful deletion
		res.status(200).json({
			messages: ['Favorite club successfully deleted'],
			error: false,
			code: 'FAVORITE_CLUB_DELETED'
		});
	} catch (error: any) {
		// Log and handle unexpected errors
		LogError(__dirname, 'DELETE', req.originalUrl, error);
		res.status(500).json({
			messages: [error.message],
			code: 'FAILED_DELETE_FAVORITE_CLUB',
			error: true
		});
	}
};

export const editTournament = async (req: IRequest, res: Response) => {
	const tournamentId = req.params.id; // Assuming the tournament id is passed in the URL parameters
	const data: IAddTournament = req.body;

	// Validation checks
	if (!data?.club) {
		return res.status(400).json({ messages: ['Please choose a linked club'], error: true, code: 'WARNING' });
	}
	if (!mongoose.Types.ObjectId.isValid(data?.club)) {
		return res.status(400).json({ messages: ['Invalid club id provided'], error: true, code: 'ERROR' });
	}
	if (!data?.name) {
		return res.status(400).json({ messages: ['Tournament name is required'], error: true, code: 'WARNING' });
	}
	if (!data?.tournamentMode) {
		return res.status(400).json({ messages: ['Tournament type is required'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'period' && data?.roundTimings?.length === 0) {
		return res.status(400).json({ messages: ['Rounds timing is required.'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'period' && data?.roundTimings?.length !== Number(data?.numberOfRounds)) {
		return res.status(400).json({ messages: ['Please add timing for all rounds'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && !data?.date) {
		return res.status(400).json({ messages: ['Tournament date is required'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && (!data?.startTime || !isValidTime(data.startTime))) {
		return res
			.status(400)
			.json({ messages: ['Invalid or missing tournament start time'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && (!data?.endTime || !isValidTime(data.endTime))) {
		return res.status(400).json({ messages: ['Invalid or missing tournament end time'], error: true, code: 'WARNING' });
	}
	// Check if start time is before end time
	if (data?.tournamentMode === 'singleDay' && timeToMinutes(data.startTime) >= timeToMinutes(data.endTime)) {
		return res.status(400).json({ messages: ['Start time must be before end time'], error: true, code: 'WARNING' });
	}
	if (!data?.playMode) {
		return res.status(400).json({ messages: ['Play mode is required'], error: true, code: 'WARNING' });
	}
	if (!data?.minMember) {
		return res.status(400).json({ messages: ['Minimum number of members is required'], error: true, code: 'WARNING' });
	}
	if (!data?.maxMember) {
		return res.status(400).json({ messages: ['Maximum number of members is required'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && !data?.playTime) {
		return res.status(400).json({ messages: ['Playing time is required'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && !data?.pauseTime) {
		return res.status(400).json({ messages: ['Game pause time is required'], error: true, code: 'WARNING' });
	}
	if (data?.tournamentMode === 'singleDay' && (!data?.courts || data?.courts?.length <= 0)) {
		return res
			.status(400)
			.json({ messages: ['At-least one court is required, please select one.'], error: true, code: 'WARNING' });
	}
	if (!data?.numberOfRounds) {
		return res.status(400).json({ messages: ['Number of rounds are required'], error: true, code: 'WARNING' });
	}
	if (!data?.foodInfo) {
		return res.status(400).json({ messages: ['Food and drink info is required'], error: true, code: 'WARNING' });
	}
	if (!data?.descriptionInfo) {
		return res
			.status(400)
			.json({ messages: ['Tournament description info is required'], error: true, code: 'WARNING' });
	}

	// Check if the tournament exists
	const tournament = await Tournament.findById(tournamentId);
	if (!tournament) {
		return res.status(404).json({ messages: ['Tournament not found'], error: true, code: 'ERROR' });
	}

	// Transactional operation
	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		// Update the tournament
		await Tournament.findByIdAndUpdate(tournamentId, data, { session, new: true });

		// Commit transaction
		await session.commitTransaction();
		session.endSession();

		return res.status(200).json({
			messages: ['Tournament updated successfully'],
			error: false,
			code: 'TOURNAMENT_UPDATED'
		});
	} catch (error) {
		// Abort transaction on failure
		await session.abortTransaction();
		session.endSession();

		// Handle error
		const errorHandler: any = mongoErrorHandler(error);
		return res.status(errorHandler?.status).json({ messages: errorHandler?.messages, error: true, code: 'ERROR' });
	}
};

export const getTournaments = async (req: IRequest, res: Response) => {
	try {
		// Extract pagination parameters
		const page = parseInt(req.query.page as string, 10) || 1; // Default to page 1
		const limit = parseInt(req.query.limit as string, 10) || 10; // Default to 10 items per page
		const skip = (page - 1) * limit;
		const status = req.query.status as string | undefined; // Get status if present, otherwise undefined
		const club = req.query.club as string | undefined; // Get club ID if provided, otherwise undefined

		// Get the user's club(s)
		const clubs = await Club.find({ user: req?.user?._id, status: 'active' }).select('_id'); // Find clubs associated with the user

		if (!clubs.length) {
			return res.status(404).json({ messages: ['No tournament found'] });
		}

		// Build the query filter for tournaments
		const filter: any = { club: { $in: clubs.map((club) => club._id) } };

		// Add status to filter if provided
		if (status) {
			filter.status = status;
		}

		// Add club filter if provided
		if (club) {
			filter.club = club; // Filter by the provided club ID
		}

		// Get tournaments associated with the user's clubs, applying the filters
		const tournaments = await Tournament.find(filter)
			.skip(skip) // Skip items for pagination
			.limit(limit) // Limit the number of tournaments per page
			.populate('club', 'name') // Optional: populate club name
			.sort({ date: -1 }); // Sort tournaments by date (most recent first)

		// Get the total count of tournaments for pagination metadata
		const totalTournaments = await Tournament.countDocuments(filter);

		// Return the tournaments and pagination metadata
		res.status(200).json({
			tournaments: tournaments || [],
			pagination: {
				total: totalTournaments,
				page,
				limit,
				totalPages: Math.ceil(totalTournaments / limit)
			}
		});
	} catch (error: any) {
		console.error(error); // Log the error (could be replaced with a custom logger)
		res.status(500).json({ messages: [error.message], code: 'FAILED_FETCH_TOURNAMENTS', error: true });
	}
};

export const getTournamentsParticipants = async (req: IRequest, res: Response) => {
	const tournamentId = req.params.id;

	// Validate tournament ID
	if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
		return res.status(400).json({
			messages: ['Invalid tournament id provided'],
			error: true,
			code: 'ERROR'
		});
	}

	try {
		// Query participants, sort by order, and populate the user details
		const tournament = await Tournament.findOne({ _id: tournamentId })
			.populate('participants', 'name email alias') // Adjust fields as needed
			.exec();
		const participants = tournament.participants;

		// Check if no participants are found
		if (!participants.length) {
			return res.status(400).json({
				messages: ['No participants found for this tournament'],
				error: true,
				code: 'NO_PARTICIPANTS'
			});
		}

		// Respond with the participants
		res.status(200).json({
			messages: ['Participants retrieved successfully'],
			participants,
			error: false,
			code: 'SUCCESS'
		});
	} catch (error: any) {
		res.status(500).json({
			messages: [error.message],
			code: 'FAILED_FETCH_TOURNAMENTS_PARTICIPANTS',
			error: true
		});
	}
};

export const updateParticipantsOrder = async (req: Request, res: Response) => {
	const { id } = req.params; // Tournament id
	const { updatedOrder } = req.body;

	try {
		// Ensure updatedOrder is a valid array with the expected structure
		if (!Array.isArray(updatedOrder)) {
			return res.status(400).json({
				message: 'Invalid data format. Expected an array of participants.',
				error: true
			});
		}

		const tournament = await Tournament.findOne({ _id: id });
		tournament.participants = updatedOrder.map((u: any) => new mongoose.Types.ObjectId(u._id));
		await tournament.save();
		return res.status(200).json({
			message: 'Participant order updated successfully'
		});
	} catch (error) {
		console.error('Error while updating participant order:', error); // Logging for debugging
		return res.status(500).json({
			message: 'Server error while updating participant order',
			error: true
		});
	}
};

export const editTournamentPauseAndPlayTime = async (req: IRequest, res: Response) => {
	const tournamentId = req.params.id; // Assuming the tournament id is passed in the URL parameters
	const data: ITournamentTiming = req.body;

	// Validate tournament ID
	if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
		return res.status(400).json({ messages: ['Invalid tournament id provided'], error: true, code: 'ERROR' });
	}

	if (!data?.pauseTime) {
		return res.status(400).json({ messages: ['Game pause time is required'], error: true, code: 'WARNING' });
	}
	if (!data?.playTime) {
		return res.status(400).json({ messages: ['Game play time is required'], error: true, code: 'WARNING' });
	}

	// Check if the tournament exists
	const tournament = await Tournament.findById(tournamentId);
	if (!tournament) {
		return res.status(404).json({ messages: ['Tournament not found'], error: true, code: 'ERROR' });
	}

	// Transactional operation
	const session = await mongoose.startSession();
	session.startTransaction();

	try {
		// Update the tournament
		await Tournament.findByIdAndUpdate(tournamentId, data, { session, new: true });

		// Commit transaction
		await session.commitTransaction();
		session.endSession();

		return res.status(200).json({
			messages: ['Tournament updated successfully'],
			error: false,
			code: 'TOURNAMENT_TIMING_UPDATED'
		});
	} catch (error) {
		// Abort transaction on failure
		await session.abortTransaction();
		session.endSession();

		// Handle error
		const errorHandler: any = mongoErrorHandler(error);
		return res.status(errorHandler?.status).json({ messages: errorHandler?.messages, error: true, code: 'ERROR' });
	}
};

export const participate = async (req: IRequest, res: Response) => {
	const user = req?.user?._id;
	const data: IParticipate = req.body;

	if (!data?.tournament) {
		return res.status(400).json({
			messages: ['Tournament id is required'],
			error: true,
			code: 'WARNING'
		});
	}

	// Validate tournament ID
	if (!mongoose.Types.ObjectId.isValid(data?.tournament)) {
		return res.status(400).json({
			messages: ['Invalid tournament id provided'],
			error: true,
			code: 'ERROR'
		});
	}

	try {
		// Find the tournament
		const tournament = await Tournament.findById(data.tournament);
		if (!tournament) {
			return res.status(404).json({
				messages: ['Tournament not found'],
				error: true,
				code: 'NOT_FOUND'
			});
		}

		// Check if the user is already a participant
		if (tournament.participants.includes(user)) {
			return res.status(400).json({
				messages: ['User is already a participant in this tournament'],
				error: true,
				code: 'ALREADY_PARTICIPANT'
			});
		}

		if (tournament.participants.length >= tournament.maxMember) {
			return res.status(400).json({
				messages: ['Maximum participant limit reached for this tournament'],
				error: true,
				code: 'LIMIT_REACHED'
			});
		}

		tournament.participants.push(user);
		await tournament.save();
		res.status(201).json({
			messages: ['Participation successful'],
			error: false,
			code: 'SUCCESS'
		});
	} catch (error: any) {
		LogError(__dirname, 'POST', req.originalUrl, error);
		res.status(500).json({
			messages: [error.message],
			code: 'ADD_PARTICIPANT',
			error: true
		});
	}
};

export const leaveParticipation = async (req: IRequest, res: Response) => {
	const user = req?.user?._id; // Extract the authenticated user ID
	const data: { tournament: string } = req.body;

	if (!data?.tournament) {
		return res.status(400).json({
			messages: ['Tournament id is required'],
			error: true,
			code: 'WARNING'
		});
	}

	// Validate tournament ID
	if (!mongoose.Types.ObjectId.isValid(data?.tournament)) {
		return res.status(400).json({
			messages: ['Invalid tournament id provided'],
			error: true,
			code: 'ERROR'
		});
	}

	try {
		const tournament = await Tournament.findById(data?.tournament);

		tournament.participants = tournament.participants.filter(
			(participantId: mongoose.Types.ObjectId) => participantId?.toString() != user?.toString()
		);
		await tournament.save();
		res.status(200).json({
			messages: ['Successfully left the tournament'],
			error: false,
			code: 'SUCCESS'
		});
	} catch (error: any) {
		LogError(__dirname, 'POST', req.originalUrl, error);
		res.status(500).json({
			messages: [error.message],
			code: 'LEAVE_PARTICIPATION',
			error: true
		});
	}
};

export const deleteParticipation = async (req: IRequest, res: Response) => {
	const { id } = req.params;
	const data: { playId: string } = req.body;

	// Validate tournament ID
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(400).json({
			messages: ['Invalid tournament id provided'],
			error: true,
			code: 'ERROR'
		});
	}

	if (!mongoose.Types.ObjectId.isValid(data?.playId)) {
		return res.status(400).json({
			messages: ['Invalid player id provided'],
			error: true,
			code: 'ERROR'
		});
	}

	const tournament = await Tournament.findOne({ _id: new mongoose.Types.ObjectId(id) });
	tournament.participants = tournament.participants.filter(
		(participantId: mongoose.Types.ObjectId) => participantId?.toString() != data?.playId?.toString()
	);
	await tournament.save();
	res.status(200).json({
		messages: ['Play removed from tournament'],
		error: false,
		code: 'SUCCESS'
	});

	// try {
	// 	// Check if the user is a participant in the tournament
	// 	const participant = await Participant.findByIdAndDelete(id);
	// 	if (!participant) {
	// 		return res.status(404).json({
	// 			messages: ['User is not a participant in this tournament'],
	// 			error: true,
	// 			code: 'NOT_FOUND'
	// 		});
	// 	}

	// 	// Remove the participant entry
	// 	await Participant.deleteOne({ _id: participant._id });

	// 	res.status(200).json({
	// 		messages: ['Play removed from tournament'],
	// 		error: false,
	// 		code: 'SUCCESS'
	// 	});
	// } catch (error: any) {
	// 	LogError(__dirname, 'POST', req.originalUrl, error);
	// 	res.status(500).json({
	// 		messages: [error.message],
	// 		code: 'LEAVE_PARTICIPATION',
	// 		error: true
	// 	});
	// }
};

export const hasClub = async (req: IRequest, res: Response) => {
	try {
		const clubExists = await Club.exists({ user: req?.user?._id, status: 'active' });
		const hasClub = clubExists ? 1 : 0;

		res.status(200).json({
			hasClub,
			error: false,
			code: 'SUCCESS'
		});
	} catch (error: any) {
		res.status(500).json({
			messages: [error.message],
			code: 'CHECK_CLUB_ERROR',
			error: true
		});
	}
};

export const courtsByClubId = async (req: IRequest, res: Response) => {
	try {
		const { clubId } = req.body;
		if (!mongoose.Types.ObjectId.isValid(clubId)) {
			return res.status(400).json({
				messages: ['Invalid club ID format'],
				code: 'INVALID_CLUB_ID',
				error: true
			});
		}
		const courts = await Court.find({ club: clubId }).select('_id name courtType placement').lean();
		res.status(200).json({
			messages: ['Courts fetched successfully'],
			courts,
			code: 'GET_COURTS_SUCCESS',
			error: false
		});
	} catch (error: any) {
		res.status(500).json({
			messages: [error.message],
			code: 'GET_COURTS_ERROR',
			error: true
		});
	}
};

export const scheduleTournament = async (req: Request, res: Response) => {
	const { id, currentRound, tournamentMode, numberOfGames, isAvoidListed } = req.body;

	// Validate tournament ID
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(400).json({ messages: ['Invalid tournament ID provided'], error: true, code: 'ERROR' });
	}
	if (!currentRound) {
		return res
			.status(400)
			.json({ messages: ['Provide current round to schedule the game'], error: true, code: 'ERROR' });
	}
	if (!tournamentMode) {
		return res.status(400).json({ messages: ['Tournament mode is required'], error: true, code: 'ERROR' });
	}
	if (currentRound == 0) {
		return res.status(400).json({ messages: ['Zero round is not allowed'], error: true, code: 'ERROR' });
	}

	try {
		// Check if schedule for this round already exists
		const existingSchedule = await Schedule.findOne({ tournament: id, currentRound });
		if (existingSchedule) {
			return res.status(409).json({
				messages: ['This round already has a scheduled game. Do you want to reschedule?'],
				error: true,
				code: 'SCHEDULE_EXISTS'
			});
		}

		// Check if an active round exists for this tournament
		const activeScheduler = await Schedule.findOne({ tournament: id, status: 'active' });
		if (activeScheduler) {
			return res.status(400).json({
				messages: [
					`Round ${activeScheduler.currentRound} is currently active for this tournament. Please finish it before scheduling a new round.`
				],
				error: true,
				code: 'ACTIVE_ROUND_EXISTS'
			});
		}

		// Check if a round is already finished for this tournament and round
		const finishedSchedule = await Schedule.findOne({
			tournament: id,
			status: 'finished',
			'rounds.round': currentRound
		});
		if (finishedSchedule) {
			return res.status(400).json({
				messages: [`You can't schedule a round that has already been played`],
				error: true,
				code: 'SCHEDULE_EXISTS'
			});
		}

		// Get participants for the tournament
		const tournament = await Tournament.findById(id).populate('participants').exec();
		if (!tournament) {
			return res.status(404).json({ messages: ['Tournament not found'], error: true, code: 'NOT_FOUND' });
		}

		const participants = tournament.participants;
		if (!participants || participants.length === 0) {
			return res.status(400).json({
				messages: ['Scheduling is not allowed as there are no participants registered for this tournament yet'],
				error: true,
				code: 'NO_PARTICIPANTS'
			});
		}

		if (participants.length < Number(tournament?.minMember)) {
			return res.status(400).json({
				messages: ['You cannot schedule the tournament till minimum members not join the tournament.'],
				error: true,
				code: 'MIN_PARTICIPANTS'
			});
		}

		if (participants.length > Number(tournament?.maxMember)) {
			return res.status(400).json({
				messages: [
					'You cannot schedule the tournament because more players joined the tournament then required number.'
				],
				error: true,
				code: 'MAX_PARTICIPANTS'
			});
		}

		if (tournament.courts.length <= 0 && tournamentMode === 'singleDay') {
			return res.status(400).json({
				messages: ['You cannot schedule the tournament because no court is found in tournament.'],
				error: true,
				code: 'MISSING_COURTS'
			});
		}

		// Validate the round number
		if (currentRound > tournament?.numberOfRounds) {
			return res.status(400).json({
				messages: [`Max round allowed is ${tournament?.numberOfRounds}`],
				error: true,
				code: 'INVALID_ROUND'
			});
		}

		// Validate tournament's date and start time
		if (tournamentMode === 'singleDay' && (!tournament?.date || !tournament?.startTime)) {
			return res.status(400).json({
				messages: ['Invalid tournament date or start time'],
				error: true,
				code: 'ERROR'
			});
		}

		// Map participants to required format
		const players: Player[] = participants.map((player: any, index: number) => ({
			id: player?._id?.toString(),
			name: player?.name,
			elo: player?.elo?.rating,
			index
		}));
		// Utility arrays
		const elos: any = {};
		const names: any = {};
		players.map((p) => {
			elos[p.id] = p.elo;
		});
		players.map((p) => {
			names[p.id] = p.name;
		});

		//Make and initialize avoid lists
		const avoidLists: any = {};
		players.map((p) => {
			avoidLists[p.id] = [];
		});

		if (isAvoidListed && currentRound > 1) {
			// 1. Get Schedule from table/model Schedule
			const schedule: ISchedule = await Schedule.findById(tournament.schedule).exec();
			if (!schedule) {
				return res.status(404).json({ messages: ['Schedule not found'], error: true, code: 'NOT_FOUND' });
			}

			// 2. Get game ids for all previous rounds
			const previousRoundGames = schedule?.rounds.filter((r) => r.round < currentRound);
			const gameIds = previousRoundGames.map((r) => r.game);

			// 3. Fetch games
			const games = await Game.find({ _id: { $in: gameIds } })
				.select('playerOne playerTwo')
				.lean();

			// 4. Update avoid lists
			for (const game of games) {
				const p1 = game.playerOne?.toString();
				const p2 = game.playerTwo?.toString();

				if (p1 && p2 && avoidLists[p1] && avoidLists[p2]) {
					if (!avoidLists[p1].includes(p2)) {
						avoidLists[p1].push(p2);
					}
					if (!avoidLists[p2].includes(p1)) {
						avoidLists[p2].push(p1);
					}
				}
			}
		}

		const buildplayers = (n: number) => {
			const matches: {
				noofgames: any;
				match: number;
				player1: any;
				player2: any;
			}[] = [];
			for (let i = 0; i < n; i++) {
				const swissplayers = players.map((p) => {
					return {
						id: p.id,
						score: 0,
						pairedUpDown: false,
						receivedBye: false,
						avoid: avoidLists[p?.id],
						rating: p.elo
					};
					// return {id:p.id, score:0, pairedUpDown:false,receivedBye:false, rating:p.elo}
				});

				const matchings = swiss(swissplayers, i, true, true);
				matchings.map((m) => {
					avoidLists[m.player1]?.push(m.player2);
					avoidLists[m.player2 ?? 0]?.push(m.player1);

					matches.push(m);
				});
			}

			return matches;
		};
		const matches = buildplayers(numberOfGames || currentRound);
		// console.table(matches);

		// Pair players for the tournament round
		const rawGames: [Player, Player][] = [];
		matches?.map((m) => {
			rawGames.push([
				{ id: m.player1, name: names[m.player1], elo: elos[m.player1] },
				{ id: m.player2, name: names[m.player2], elo: elos[m.player2] }
			]);
		});

		const games = rawGames.filter(
			([player1, player2]) =>
				player1.id &&
				player1.name &&
				player1.elo !== undefined &&
				player2.id &&
				player2.name &&
				player2.elo !== undefined
		);

		if (tournamentMode === 'singleDay') {
			// Prepare court and schedule data
			const courts = tournament?.courts;
			const existingGames = await Game.find({ tournament: tournament._id }).sort({ startTime: -1 }).lean();

			let startTime: Date | string;

			if (!existingGames.length) {
				// 2. No games yet, use the original logic
				startTime = formatDateTime(tournament.date?.toString(), tournament?.startTime);
				startTime = new Date(startTime);
			} else {
				// 3. Games exist, find latest startTime and add playTime + pauseTime
				const latestGame = existingGames[0];
				const latestStart = new Date(latestGame.startTime);
				const playTime = tournament?.playTime ? parseInt(tournament.playTime) : 0;
				const pauseTime = tournament?.pauseTime ? parseInt(tournament.pauseTime) : 0;
				startTime = new Date(latestStart.getTime() + (playTime + pauseTime) * 60000);
			}
			const _playTime = tournament?.playTime ? parseInt(tournament.playTime) : 0;
			const _pauseTime = tournament?.pauseTime ? parseInt(tournament.pauseTime) : 0;
			const gameDuration = _playTime + _pauseTime;
			
			const scheduledGames = assignCourtsToGames(games, courts, startTime, gameDuration);
			const createdGames = await Promise.all(
				scheduledGames.map(async (_game) => {
					if (!_game?.player1 || !_game?.player2 || !_game?.court) {
						throw new Error('Invalid game data: Missing players or court assignment.');
					}

					const gm = {
						playerOne: _game.player1?.id,
						playerTwo: _game.player2?.id,
						court: _game.court?._id,
						startTime: _game?.startTime,
						endTime: _game?.startTime ? new Date(_game.startTime.getTime() + gameDuration * 60000) : undefined,
						playMode: tournament?.playMode,
						tournament: tournament?._id
					};

					const createdGame = await Game.create(gm);
					return { game: createdGame._id, round: currentRound, slot: _game?.slot };
				})
			);
			const schedule = await Schedule.findById(tournament.schedule);
			createdGames.map((gme) => {
				schedule.rounds.push(gme);
			});
			schedule.status = 'active';
			schedule.currentRound = currentRound;
			await schedule.save();

			// Return success response
			res.status(200).json({
				games: scheduledGames,
				messages: [`Game scheduled successfully for round ${currentRound}`],
				code: 'SCHEDULER_SET',
				error: false
			});
		} else {
			const scheduledGames = games?.map((games) => ({
				player1: games[0], // Includes id, name, elo
				player2: games[1] // Includes id, name, elo
			}));

			const createdGames = await Promise.all(
				scheduledGames.map(async (_game) => {
					if (!_game?.player1 || !_game?.player2) {
						throw new Error('Invalid game data: Missing players');
					}

					const gm = {
						playerOne: _game.player1?.id,
						playerTwo: _game.player2?.id,
						playMode: tournament?.playMode,
						tournament: tournament?._id
					};

					const createdGame = await Game.create(gm);
					return { game: createdGame._id, round: currentRound };
				})
			);
			const schedule = await Schedule.findById(tournament.schedule);
			createdGames.map((gme) => {
				schedule?.rounds?.push(gme);
			});
			schedule.status = 'active';
			schedule.currentRound = currentRound;
			await schedule.save();

			// Return success response
			res.status(200).json({
				games: scheduledGames,
				messages: [`Game scheduled successfully for round ${currentRound}`],
				code: 'SCHEDULER_SET',
				error: false
			});
		}
	} catch (error: any) {
		// Handle errors and log them
		res.status(500).json({
			messages: [error.message],
			code: 'SCHEDULER_ERROR',
			error: true
		});
	}
};

export const reScheduleTournament = async (req: Request, res: Response) => {
	const { id, currentRound, tournamentMode, numberOfGames, isAvoidListed } = req.body;

	// Validate tournament ID
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(400).json({ messages: ['Invalid tournament ID provided'], error: true, code: 'ERROR' });
	}
	if (!currentRound) {
		return res
			.status(400)
			.json({ messages: ['Provide current round to reschedule the game'], error: true, code: 'ERROR' });
	}
	if (!tournamentMode) {
		return res.status(400).json({ messages: ['Tournament mode is required'], error: true, code: 'ERROR' });
	}
	if (currentRound == 0) {
		return res.status(400).json({ messages: ['Zero round is not allowed'], error: true, code: 'ERROR' });
	}

	try {
		// Get participants for the tournament
		const tournament = await Tournament.findById(id).populate('participants').exec();
		const participants = tournament.participants;
		if (!tournament) {
			return res.status(404).json({ messages: ['Tournament not found'], error: true, code: 'NOT_FOUND' });
		}

		if (!participants || participants.length === 0) {
			return res.status(400).json({
				messages: ['Rescheduling is not allowed as there are no participants registered for this tournament'],
				error: true,
				code: 'NO_PARTICIPANTS'
			});
		}

		// Validate the round number
		if (currentRound > tournament?.numberOfRounds) {
			return res.status(400).json({
				messages: [`Max round allowed is ${tournament?.numberOfRounds}`],
				error: true,
				code: 'INVALID_ROUND'
			});
		}

		// Validate tournament's date and start time
		if (tournamentMode === 'singleDay' && (!tournament?.date || !tournament?.startTime)) {
			return res.status(400).json({
				messages: ['Invalid tournament date or start time'],
				error: true,
				code: 'ERROR'
			});
		}

		const schedule: ISchedule = await Schedule.findById(tournament.schedule).exec();
		if (!schedule) {
			return res.status(404).json({ messages: ['Schedule not found'], error: true, code: 'NOT_FOUND' });
		}

		// Map participants to required format
		const players: Player[] = participants.map((player: any, index: number) => ({
			id: player?._id?.toString(),
			name: player?.name,
			elo: player?.elo?.rating,
			index
		}));
		// Utility arrays
		const elos: any = {};
		const names: any = {};
		players.map((p) => {
			elos[p.id] = p.elo;
		});
		players.map((p) => {
			names[p.id] = p.name;
		});

		//Make and initialize avoid lists
		const avoidLists: any = {};
		players.map((p) => {
			avoidLists[p.id] = [];
		});

		if (isAvoidListed && currentRound > 1) {
			// 2. Get game ids for all previous rounds
			const previousRoundGames = schedule?.rounds.filter((r) => r.round < currentRound);
			const gameIds = previousRoundGames.map((r) => r.game);

			// 3. Fetch games
			const games = await Game.find({ _id: { $in: gameIds } })
				.select('playerOne playerTwo')
				.lean();

			// 4. Update avoid lists
			for (const game of games) {
				const p1 = game.playerOne?.toString();
				const p2 = game.playerTwo?.toString();

				if (p1 && p2 && avoidLists[p1] && avoidLists[p2]) {
					if (!avoidLists[p1].includes(p2)) {
						avoidLists[p1].push(p2);
					}
					if (!avoidLists[p2].includes(p1)) {
						avoidLists[p2].push(p1);
					}
				}
			}
		}

		// Delete adjust scheduled games
		// Delete current-round games (await!)
		const activeRounds = schedule.rounds.filter((r: IRound) => r.round === Number(currentRound));
		await Promise.all(activeRounds.map((r: IRound) => Game.findByIdAndDelete(r.game)));
		schedule.rounds = schedule.rounds.filter((r: IRound) => r.round !== Number(currentRound));

		const buildplayers = (n: number) => {
			const matches: {
				noofgames: any;
				match: number;
				player1: any;
				player2: any;
			}[] = [];
			for (let i = 0; i < n; i++) {
				const swissplayers = players.map((p) => {
					return {
						id: p.id,
						score: 0,
						pairedUpDown: false,
						receivedBye: false,
						avoid: avoidLists[p?.id],
						rating: p.elo
					};
					// return {id:p.id, score:0, pairedUpDown:false,receivedBye:false, rating:p.elo}
				});

				const matchings = swiss(swissplayers, i, true, true);
				matchings.map((m) => {
					avoidLists[m.player1]?.push(m.player2);
					avoidLists[m.player2 ?? 0]?.push(m.player1);

					matches.push(m);
				});
			}

			return matches;
		};
		const matches = buildplayers(numberOfGames ?? 1);

		// Pair players for the tournament round
		const rawGames: [Player, Player][] = [];
		matches?.map((m) => {
			rawGames.push([
				{ id: m.player1, name: names[m.player1], elo: elos[m.player1] },
				{ id: m.player2, name: names[m.player2], elo: elos[m.player2] }
			]);
		});

		const games = rawGames.filter(
			([player1, player2]) =>
				player1.id &&
				player1.name &&
				player1.elo !== undefined &&
				player2.id &&
				player2.name &&
				player2.elo !== undefined
		);

		if (tournamentMode === 'singleDay') {
			// Prepare court and schedule data
			const courts = tournament.courts as any[];

			// Durations
			const _playTime = tournament?.playTime ? parseInt(tournament.playTime, 10) : 0;
			const _pauseTime = tournament?.pauseTime ? parseInt(tournament.pauseTime, 10) : 0;
			const gameDuration = _playTime + _pauseTime;

			// Only consider games from rounds < currentRound
			const prevRoundEntries = schedule.rounds.filter((r: IRound) => r.round < Number(currentRound));
			const prevGameIds = prevRoundEntries.map((r) => r.game);

			// Shape for lean docs we read
			type StartEnd = { startTime?: Date | string; endTime?: Date | string };

			// Fetch previous games (if any) with proper typing
			const prevGames: StartEnd[] = prevGameIds.length
				? await Game.find({ _id: { $in: prevGameIds } })
						.select('startTime endTime')
						.lean<StartEnd[]>()
				: [];

			// Helper to get an end-time even if it’s missing on doc
			const toEnd = (g: StartEnd): Date | null => {
				if (g.endTime) return new Date(g.endTime);
				if (g.startTime) return new Date(new Date(g.startTime).getTime() + gameDuration * 60000);
				return null;
			};

			let startTime: Date;
			const endTimes = prevGames.map(toEnd).filter((d): d is Date => !!d);

			if (endTimes.length === 0) {
				// No previous rounds: start from tournament start
				const start = formatDateTime(tournament.date?.toString(), tournament.startTime, Number(tournament.pauseTime));
				startTime = new Date(start);
			} else {
				// Start right after the latest previous-round game ends
				const latestEndMs = Math.max(...endTimes.map((d) => d.getTime()));
				startTime = new Date(latestEndMs);
			}
			const scheduledGames = assignCourtsToGames(games, courts, startTime, gameDuration);
			// Create new schedule
			const createdGames = await Promise.all(
				scheduledGames.map(async (_game) => {
					if (!_game?.player1 || !_game?.player2 || !_game?.court) {
						throw new Error('Invalid game data: Missing players or court assignment.');
					}

					const gm = {
						playerOne: _game.player1?.id,
						playerTwo: _game.player2?.id,
						court: _game.court?._id,
						startTime: _game?.startTime,
						endTime: _game?.startTime ? new Date(_game.startTime.getTime() + gameDuration * 60000) : undefined,
						tournament: tournament?._id,
						playMode: tournament?.playMode
					};

					const createdGame = await Game.create(gm);
					return { game: createdGame._id, round: currentRound, slot: _game?.slot };
				})
			);
			// Reschedule
			createdGames.map((gme) => {
				schedule.rounds.push(gme);
			});
			schedule.status = 'active';
			schedule.currentRound = currentRound;
			await schedule.save();

			// Return success response
			res.status(200).json({
				// games: scheduledGames,
				messages: [`Game rescheduled successfully for round ${currentRound}`],
				code: 'SCHEDULER_SET',
				error: false
			});
		} else {
			const scheduledGames = games?.map((games) => ({
				player1: games[0], // Includes id, name, elo
				player2: games[1] // Includes id, name, elo
			}));

			// Create new schedule
			const createdGames = await Promise.all(
				scheduledGames.map(async (_game) => {
					if (!_game?.player1 || !_game?.player2) {
						throw new Error('Invalid game data: Missing players');
					}

					const gm = {
						playerOne: _game.player1?.id,
						playerTwo: _game.player2?.id,
						playMode: tournament?.playMode,
						tournament: tournament?._id
					};

					const createdGame = await Game.create(gm);
					return { game: createdGame._id, round: currentRound };
				})
			);

			// Reschedule
			createdGames.map((gme) => {
				schedule.rounds.push(gme as any);
			});
			schedule.status = 'active';
			schedule.currentRound = currentRound;
			await schedule.save();

			// Return success response
			res.status(200).json({
				// games: scheduledGames,
				messages: [`Game rescheduled successfully for round ${currentRound}`],
				code: 'SCHEDULER_SET',
				error: false
			});
		}
	} catch (error: any) {
		res.status(500).json({
			messages: [error.message],
			code: 'RE_SCHEDULER_ERROR',
			error: true
		});
	}
};

export const getTournamentsForDropdown = async (req: Request, res: Response) => {
	try {
		// Extract the search query from request query parameters
		const search = req.query.search as string;
		// Build the query
		const query: any = { status: 'active' };
		if (search) {
			query.name = { $regex: search, $options: 'i' }; // Case-insensitive search
		}
		// Fetch tournaments with the query
		const tournaments = await Tournament.find(query).select('_id name').exec();
		res.status(200).json({
			tournaments,
			error: false,
			code: 'DROPDOWN_TOURNAMENT_FETCHED'
		});
	} catch (error: any) {
		LogError(__dirname, 'GET', req.originalUrl, error);
		res.status(500).json({
			messages: [error.message],
			code: 'FAILED_FETCH_DROPDOWN_TOURNAMENT',
			error: true
		});
	}
};

export const getTournamentActiveRoundByID = async (req: IRequest, res: Response) => {
	const user = req?.user?._id;
	try {
		const tournament = req.query.tournament as string;
		const activeRound = await Schedule.findOne({
			tournament,
			status: 'active'
		}).select('currentRound');

		const round = activeRound?.currentRound;

		res.status(200).json({
			round: activeRound,
			error: false,
			code: 'ACTIVE_TOURNAMENT_ROUND_FETCHED'
		});
	} catch (error: any) {
		LogError(__dirname, 'GET', req.originalUrl, error);
		res.status(500).json({
			messages: [error.message],
			code: 'FAILED_ACTIVE_TOURNAMENT_ROUND_FETCHED',
			error: true
		});
	}
};

export const getUserParticipatedTournaments = async (req: IRequest, res: Response) => {
	const userId = req?.user?._id; // Ensure you have user authentication in place

	try {
		const tournaments = await Tournament.find({ participants: userId })
			.populate('club', 'name') // Populate club details
			.populate('schedule') // Populate schedule if needed
			.populate('courts', 'name') // Populate courts with names
			.populate('participants', 'name alias') // Populate participants' names and aliases
			.exec();

		res.status(200).json({
			tournaments,
			error: false,
			code: 'USER_PARTICIPATED_TOURNAMENTS_FETCHED'
		});
	} catch (error: any) {
		console.error('Error fetching tournaments:', error);
		res.status(500).json({
			messages: [error.message],
			code: 'FAILED_USER_PARTICIPATED_TOURNAMENTS_FETCH',
			error: true
		});
	}
};

export const getScheduledGames = async (req: Request, res: Response) => {
	const tournamentId = req.params.id;

	// Validate tournament ID
	if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
		return res.status(400).json({
			messages: ['Invalid tournament id provided'],
			error: true,
			code: 'ERROR'
		});
	}

	try {
		const games = await Schedule.find({ tournament: tournamentId, status: 'active' });

		// Respond with the participants
		res.status(200).json({
			messages: ['Tournament games fetched successfully'],
			games,
			error: false,
			code: 'SUCCESS'
		});
	} catch (error: any) {
		res.status(500).json({
			messages: [error.message],
			code: 'FAILED_FETCH_TOURNAMENTS_GAMES',
			error: true
		});
	}
};

export const validateScore = async (req: IRequest, res: Response) => {
	const { playerOne_hmacKey, playerTwo_hmacKey, currentRound, scores, tournament, qrcode } = req.body;
	const validator = req?.user?._id as string;

	// Validate tournament ID
	if (!mongoose.Types.ObjectId.isValid(tournament)) {
		return res.status(400).json({
			messages: ['Invalid tournament id provided'],
			error: true,
			code: 'ERROR'
		});
	}

	// Validate creator ID
	if (!playerOne_hmacKey) {
		return res.status(400).json({
			messages: ['Player one HMAC Signature is required'],
			error: true,
			code: 'ERROR'
		});
	}

	if (!playerTwo_hmacKey) {
		return res.status(400).json({
			messages: ['Player two (validator) HMAC Signature is required'],
			error: true,
			code: 'ERROR'
		});
	}

	if (!currentRound) {
		return res.status(400).json({
			messages: ['Current round is required'],
			error: true,
			code: 'ERROR'
		});
	}

	if (!qrcode) {
		return res.status(400).json({
			messages: ['QR code string is required'],
			error: true,
			code: 'ERROR'
		});
	}

	// Check that the validator is not the creator
	if (playerOne_hmacKey?.toString() === playerTwo_hmacKey?.toString()) {
		return res.status(400).json({
			messages: ['You cannot validate the score, let the opponent player to verify it.'],
			error: true,
			code: 'INVALID_VALIDATOR'
		});
	}

	try {
		// Get creator id using player one hmac
		const PlayerOne = await User.findOne({ hmacKey: playerOne_hmacKey }).exec();
		const PlayerTwo = await User.findOne({ hmacKey: playerTwo_hmacKey }).exec();

		// Find game id of the match using player's ids
		const activeGame = await Game.findOne({
			status: 'active',
			$or: [
				{ playerOne: PlayerOne?._id, playerTwo: validator },
				{ playerOne: validator, playerTwo: PlayerOne?._id }
			]
		}).exec();

		if (!activeGame) {
			return res.status(400).json({
				messages: ['No active game found for these players'],
				error: true,
				code: 'GAME_NOT_FOUND'
			});
		}

		const playerOneScores = scores[playerOne_hmacKey]; // [6, 4, "wo"]
		const playerTwoScores = scores[playerTwo_hmacKey]; // [3, 6, 2]

		// Setup Glicko2 instance
		const ranking = new Glicko2({
			tau: 0.5,
			rating: 1500,
			rd: 200,
			vol: 0.06
		});

		// Create Glicko2 players
		const player1 = ranking.makePlayer(PlayerOne.elo.rating, PlayerOne.elo.rd, PlayerOne.elo.vol);
		const player2 = ranking.makePlayer(PlayerTwo.elo.rating, PlayerTwo.elo.rd, PlayerTwo.elo.vol);

		// Determine winner based on score array
		let playerOneSetsWon = 0;
		let playerTwoSetsWon = 0;

		// Iterate over scores (pairwise comparison)
		for (let i = 0; i < Math.max(playerOneScores.length, playerTwoScores.length); i++) {
			const scoreOne = playerOneScores[i];
			const scoreTwo = playerTwoScores[i];

			if (scoreOne === 'wo') {
				// Player One forfeited, Player Two wins the set
				playerTwoSetsWon++;
			} else if (scoreTwo === 'wo') {
				// Player Two forfeited, Player One wins the set
				playerOneSetsWon++;
			} else if (scoreOne !== undefined && scoreTwo !== undefined) {
				// Normal case, compare numeric scores
				if (scoreOne > scoreTwo) {
					playerOneSetsWon++;
				} else if (scoreTwo > scoreOne) {
					playerTwoSetsWon++;
				}
			}
		}

		let result: 1 | 0 | 0.5;
		if (playerOneSetsWon > playerTwoSetsWon) {
			result = 1;
		} else if (playerTwoSetsWon > playerOneSetsWon) {
			result = 0;
		} else {
			result = 0.5; // Tie
		}

		// Update Elo ratings
		ranking.updateRatings([[player1, player2, result]]);

		// Save new ratings
		PlayerOne.elo.rating = player1.getRating();
		PlayerOne.elo.rd = player1.getRd();
		PlayerOne.elo.vol = player1.getVol();
		await PlayerOne.save();

		PlayerTwo.elo.rating = player2.getRating();
		PlayerTwo.elo.rd = player2.getRd();
		PlayerTwo.elo.vol = player2.getVol();
		await PlayerTwo.save();

		activeGame.score = {
			playerOneScores,
			playerTwoScores
		};
		activeGame.status = 'finished';
		await activeGame.save();

		// Check If all games related to the tournament has been finished If yes then update schedule status to finished and also set currentRound to 0
		// To do it first get schedule using tournament id, get game (ids) from rounds in schedule using currentRound, search for all active games if no one found it means rounded has been finished the validator player is last one whose is validating his score
		const schedule = await Schedule.findOne({ tournament }).exec();
		if (!schedule) {
			return res.status(404).json({ messages: ['Schedule not found'], error: true, code: 'SCHEDULE_NOT_FOUND' });
		}

		const roundGames = schedule.rounds.filter((r: IRound) => r.round === currentRound).map((r: IRound) => r.game);
		const activeGames = await Game.find({ _id: { $in: roundGames }, status: 'active' }).exec();

		if (activeGames.length === 0) {
			schedule.status = 'finished';
			schedule.currentRound = 0;
			await schedule.save();
		}

		return res.status(200).json({
			messages: ['Score validated successfully!'],
			error: false,
			code: 'SUCCESS'
		});
	} catch (error: any) {
		LogError(__dirname, 'POST', req.originalUrl, error);
		return res.status(500).json({
			messages: [error.message],
			code: 'FAILED_SCORE_VALIDATION',
			error: true
		});
	}
};

export const isAdmin = async (req: IRequest, res: Response) => {
	const { id } = req.body; // Tournament ID
	const userId = req?.user?._id;

	try {
		if (!id) {
			return res.status(400).json({
				messages: ['Tournament ID is required'],
				code: 'BAD_REQUEST',
				error: true
			});
		}

		// Find the tournament and populate the associated club
		const tournament = await Tournament.findById(id).populate({
			path: 'club',
			select: 'user' // Fetch only the user field of the club
		});

		if (!tournament) {
			return res.status(400).json({
				messages: ['Tournament not found'],
				code: 'NOT_FOUND',
				error: true
			});
		}

		// Check if the user is the admin of the associated club
		const isAdmin = tournament.club && String(tournament.club.user) === String(userId);

		// If the user is an admin
		res.status(200).json({
			isAdmin,
			messages: ['Admin access to tournament'],
			code: 'SUCCESS',
			error: false
		});
	} catch (error: any) {
		console.error('Error checking admin status:', error);

		res.status(500).json({
			messages: [error.message || 'Internal server error'],
			code: 'CHECK_TOURNAMENT_ADMIN_ERROR',
			error: true
		});
	}
};

export const addOrUpdateScoreByOrganizer = async (req: IRequest, res: Response) => {
	try {
		const { gameId, scores } = req.body;

		// Validate gameId
		if (!gameId || !mongoose.Types.ObjectId.isValid(gameId)) {
			return res.status(400).json({
				messages: ['Invalid or missing game ID'],
				error: true,
				code: 'INVALID_GAME_ID'
			});
		}

		// Validate scores object
		if (!scores || typeof scores !== 'object' || Object.keys(scores).length < 2) {
			return res.status(400).json({
				messages: ['Scores object is required and must contain both players'],
				error: true,
				code: 'INVALID_SCORES'
			});
		}

		// Fetch the game
		const game = await Game.findById(gameId);
		if (!game) {
			return res.status(404).json({
				messages: ['Game not found'],
				error: true,
				code: 'GAME_NOT_FOUND'
			});
		}

		// Prepare score arrays using types from IGame
		let playerOneScores: IGame['score']['playerOneScores'] = [];
		let playerTwoScores: IGame['score']['playerTwoScores'] = [];

		for (const [playerId, scoreObj] of Object.entries(scores) as [
			string,
			{ type: 'playerOne' | 'playerTwo'; scores: (number | 'wo')[] }
		][]) {
			if (scoreObj.type === 'playerOne' && game.playerOne.toString() === playerId) {
				playerOneScores = scoreObj.scores as IGame['score']['playerOneScores'];
			}
			if (scoreObj.type === 'playerTwo' && game.playerTwo.toString() === playerId) {
				playerTwoScores = scoreObj.scores as IGame['score']['playerTwoScores'];
			}
		}

		// Validate that both scores are present
		if (!playerOneScores.length || !playerTwoScores.length) {
			return res.status(400).json({
				messages: ['Scores for both players are required'],
				error: true,
				code: 'MISSING_PLAYER_SCORES'
			});
		}

		// --- 1. Calculate ranking and update ELO ---
		const PlayerOne = await User.findById(game.playerOne);
		const PlayerTwo = await User.findById(game.playerTwo);

		const ranking = new Glicko2({
			tau: 0.5,
			rating: 1500,
			rd: 200,
			vol: 0.06
		});

		const player1 = ranking.makePlayer(PlayerOne.elo.rating, PlayerOne.elo.rd, PlayerOne.elo.vol);
		const player2 = ranking.makePlayer(PlayerTwo.elo.rating, PlayerTwo.elo.rd, PlayerTwo.elo.vol);

		let playerOneSetsWon = 0;
		let playerTwoSetsWon = 0;

		for (let i = 0; i < Math.max(playerOneScores.length, playerTwoScores.length); i++) {
			const scoreOne = playerOneScores[i];
			const scoreTwo = playerTwoScores[i];

			if (scoreOne === 'wo') {
				playerTwoSetsWon++;
			} else if (scoreTwo === 'wo') {
				playerOneSetsWon++;
			} else if (scoreOne !== undefined && scoreTwo !== undefined) {
				if (scoreOne > scoreTwo) {
					playerOneSetsWon++;
				} else if (scoreTwo > scoreOne) {
					playerTwoSetsWon++;
				}
			}
		}

		let result: 1 | 0 | 0.5;
		if (playerOneSetsWon > playerTwoSetsWon) {
			result = 1;
		} else if (playerTwoSetsWon > playerOneSetsWon) {
			result = 0;
		} else {
			result = 0.5;
		}

		ranking.updateRatings([[player1, player2, result]]);

		PlayerOne.elo.rating = player1.getRating();
		PlayerOne.elo.rd = player1.getRd();
		PlayerOne.elo.vol = player1.getVol();
		await PlayerOne.save();

		PlayerTwo.elo.rating = player2.getRating();
		PlayerTwo.elo.rd = player2.getRd();
		PlayerTwo.elo.vol = player2.getVol();
		await PlayerTwo.save();

		// --- Update game score and status ---
		game.score = {
			playerOneScores,
			playerTwoScores
		};
		game.status = 'finished';
		await game.save();

		// --- 2. Set schedule status to finished if all games scores added ---
		const schedule = await Schedule.findOne({ tournament: game.tournament }).exec();
		if (schedule) {
			const currentRound = schedule.currentRound;
			const roundGames = schedule.rounds.filter((r: IRound) => r.round === currentRound).map((r: IRound) => r.game);
			const activeGames = await Game.find({ _id: { $in: roundGames }, status: 'active' }).exec();

			if (activeGames.length === 0) {
				schedule.status = 'finished';
				schedule.currentRound = 0;
				await schedule.save();
			}
		}

		return res.status(200).json({
			messages: ['Game score updated successfully'],
			error: false,
			code: 'GAME_SCORE_UPDATED'
		});
	} catch (error: any) {
		return res.status(500).json({
			messages: [error.message],
			error: true,
			code: 'GAME_SCORE_UPDATE_ERROR'
		});
	}
};
