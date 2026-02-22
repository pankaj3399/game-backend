/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { LogError } from '../utils/logs';
import Club from '../models/club';
import mongoose from 'mongoose';
import Participant from '../models/participant';
import Tournament from '../models/tournament';
import Scheduler, { IRound } from '../models/schedule';
import Schedule from '../models/schedule';
import Game from '../models/game';
import Favorite from '../models/favorite';

export const publicClubs = async (req: Request, res: Response) => {
	try {
		// Extract the search query from request query parameters
		const search = req.query.search as string;
		// Build the query
		const query: any = { status: 'active' };
		if (search) {
			query.name = { $regex: search, $options: 'i' }; // Case-insensitive search
		}
		// Fetch clubs with the query
		const clubs = await Club.find(query).select('_id name').exec();
		res.status(200).json({
			clubs,
			error: false,
			code: 'DROPDOWN_CLUB_FETCHED'
		});
	} catch (error: any) {
		LogError(__dirname, 'GET', req.originalUrl, error);
		res.status(500).json({
			messages: [error.message],
			code: 'FAILED_FETCH_DROPDOWN_CLUBS',
			error: true
		});
	}
};

export const publicDropdownClubs = async (req: Request, res: Response) => {
	try {
		// Fetch all active clubs
		const clubs = await Club.find({ status: 'active' }).select('_id name').exec();

		// Format into { label, value }
		const formattedClubs = clubs.map((club) => ({
			label: club.name,
			value: club._id
		}));

		res.status(200).json({
			clubs: formattedClubs,
			error: false,
			code: 'DROPDOWN_CLUB_FETCHED'
		});
	} catch (error: any) {
		LogError(__dirname, 'GET', req.originalUrl, error);
		res.status(500).json({
			messages: [error.message],
			code: 'FAILED_FETCH_DROPDOWN_CLUBS',
			error: true
		});
	}
};

export const filterClubs = async (req: Request, res: Response) => {
	try {
		const userId = req.query.userId as string | undefined;

		let favoriteClubIds: string[] = [];
		let favoriteClubsFormatted: { label: string; value: any }[] = [];

		// Check if userId exists, is not the string "undefined", and is a valid ObjectId
		if (userId && userId !== 'undefined' && mongoose.Types.ObjectId.isValid(userId)) {
			const favorites = await Favorite.find({ user: userId })
				.sort({ status: -1 }) // 'active' first
				.populate('club', '_id name status');

			// Filter out nulls and inactive clubs
			const validFavorites = favorites.map((fav) => fav.club).filter((club: any) => club && club.status === 'active');

			// Format favorites
			favoriteClubsFormatted = validFavorites.map((club: any) => ({
				label: club.name,
				value: club._id
			}));

			favoriteClubIds = validFavorites.map((club: any) => club._id.toString());
		}

		// Fetch all active clubs
		const allClubs = await Club.find({ status: 'active' }).select('_id name').exec();

		// Filter out clubs already in favorites
		const nonFavoriteClubs = allClubs.filter((club) => !favoriteClubIds.includes(club._id.toString()));

		// Format remaining clubs
		const otherClubsFormatted = nonFavoriteClubs.map((item) => ({
			label: item.name,
			value: item._id
		}));

		// Merge and sort all clubs
		const combined = [...favoriteClubsFormatted, ...otherClubsFormatted];
		if (!userId || userId === 'undefined' || !mongoose.Types.ObjectId.isValid(userId) || favoriteClubsFormatted.length === 0) combined.sort((a, b) => a.label.localeCompare(b.label));

		// Respond with the formatted, sorted clubs
		res.status(200).json({
			clubs: combined,
			error: false,
			code: 'FILTER_CLUB_FETCHED'
		});
	} catch (error: any) {
		LogError(__dirname, 'GET', req.originalUrl, error);
		res.status(500).json({
			messages: [error.message],
			code: 'FAILED_FETCH_FILTER_CLUBS',
			error: true
		});
	}
};

export const getTournamentsForParticipation = async (req: Request, res: Response) => {
	const { coordinates, radius, clubId, dateFilter } = req.body;

	try {
		// Base query for tournaments
		const query: any = {
			status: 'active'
		};

		// Filter by favorite club
		if (clubId && clubId !== '') {
			if (!mongoose.Types.ObjectId.isValid(clubId)) {
				return res.status(400).json({
					messages: ['Invalid favorite club id provided'],
					error: true,
					code: 'INVALID_FAVORITE_CLUB_ID'
				});
			}
			query.club = clubId;
		}

		// Filter by geographical radius using club coordinates
		if (coordinates && radius) {
			let minRadius = 0;
			let maxRadius = Infinity;

			if (radius === '<50') {
				maxRadius = 50;
			} else if (radius === '50-80') {
				minRadius = 50;
				maxRadius = 80;
			} else if (radius === '>80') {
				minRadius = 80;
			}

			const { longitude, latitude } = coordinates;

			// First, find clubs within the max radius
			const nearbyClubs = await Club.find({
				coordinates: {
					$geoWithin: {
						$centerSphere: [[longitude, latitude], maxRadius / 6378.1] // max radius in radians
					}
				}
			}).select('_id coordinates'); // also select coordinates for filtering minRadius

			// Now filter clubs by minRadius (post-query filtering)
			const filteredClubs = nearbyClubs.filter((club: any) => {
				const [clubLng, clubLat] = club.coordinates;
				const toRad = (val: number) => (val * Math.PI) / 180;
				const R = 6371; // Earth's radius in km

				const dLat = toRad(clubLat - latitude);
				const dLon = toRad(clubLng - longitude);
				const a =
					Math.sin(dLat / 2) ** 2 + Math.cos(toRad(latitude)) * Math.cos(toRad(clubLat)) * Math.sin(dLon / 2) ** 2;
				const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
				const distance = R * c;

				return distance >= minRadius;
			});

			if (filteredClubs.length > 0) {
				query.club = { $in: filteredClubs.map((club) => club._id) };
			} else {
				return res.status(200).json({
					tournaments: [],
					error: false,
					code: 'NO_TOURNAMENTS_FOUND'
				});
			}
		}

		// Filter by date
		const now = new Date();
		if (dateFilter && dateFilter !== '') {
			if (dateFilter === 'past') {
				query.date = { $lt: now };
			} else if (dateFilter === 'future') {
				query.date = { $gte: now };
			}
		}

		// Execute the query with specific fields
		const tournaments = await Tournament.find(query, '_id name date startTime endTime maxMember club logo')
			.populate('club', 'name address coordinates') // Populate club info
			.lean();

		// Add participant count, "isFull" flag, and "hasSchedule" flag to each tournament
		const tournamentsWithFlags = await Promise.all(
			tournaments.map(async (tournament) => {
				const participantCount = await Participant.countDocuments({ tournament: tournament._id });
				const isFull = participantCount >= tournament.maxMember;

				// Check if a scheduler exists for the tournament
				const schedulerExists = await Scheduler.exists({ tournament: tournament._id, status: 'active' });

				return {
					_id: tournament._id,
					name: tournament.name,
					date: tournament.date,
					startTime: tournament.startTime,
					endTime: tournament.endTime,
					isFull,
					hasSchedule: !!schedulerExists, // Flag based on the existence of scheduler
					club: tournament.club, // Include club details
					logo: tournament?.logo
				};
			})
		);

		// Sort tournaments alphabetically by name
		tournamentsWithFlags.sort((a, b) => a.name.localeCompare(b.name));

		res.status(200).json({
			tournaments: tournamentsWithFlags,
			error: false,
			code: 'SUCCESS'
		});
	} catch (error: any) {
		LogError(__dirname, 'GET', req.originalUrl, error);
		res.status(500).json({
			messages: [error.message],
			code: 'GET_TOURNAMENT_WITH_PARTICIPANTS',
			error: true
		});
	}
};

export const getGames = async (req: Request, res: Response) => {
	try {
		const { id } = req.body;

		// Validate ID
		if (!mongoose.Types.ObjectId.isValid(id)) {
			return res.status(400).json({ messages: ['Invalid tournament ID provided'], error: true, code: 'ERROR' });
		}

		// Find tournament and populate schedule
		const tournament = await Tournament.findById(id).populate('schedule').exec();
		if (!tournament || !tournament.schedule) {
			return res.status(404).json({
				messages: ['Tournament or schedule not found'],
				code: 'NOT_FOUND',
				error: true
			});
		}

		// Find the schedule
		const schedule = await Schedule.findById(tournament.schedule._id).exec();
		if (!schedule) {
			return res.status(404).json({
				messages: ['Schedule not found'],
				code: 'SCHEDULE_NOT_FOUND',
				error: true
			});
		}

		// Get all rounds (not just active)
		const allRounds = schedule.rounds;

		if (!allRounds || allRounds.length === 0) {
			return res.status(404).json({
				messages: ['No rounds found'],
				code: 'ROUND_NOT_FOUND',
				error: true
			});
		}

		// Fetch all games for all rounds
		const games = await Game.find({
			_id: { $in: allRounds.map((round: IRound) => round.game) }
		})
			.populate('playerOne', 'name alias email')
			.populate('playerTwo', 'name alias email')
			.populate('court')
			.exec();

		// Add round and currentRound to each game
		const gamesWithRound = games.map((game: any) => ({
			...game.toObject(),
			round: allRounds.find((round: any) => round.game.toString() === game._id.toString())?.round,
			currentRound: schedule.currentRound,
			tournamentMode: tournament?.tournamentMode
		}));

		// Send response
		return res.status(200).json({
			error: false,
			code: 'SUCCESS',
			slots: gamesWithRound
		});
	} catch (error: any) {
		console.error('Error fetching round games:', error);
		return res.status(500).json({
			messages: [error.message],
			code: 'SERVER_ERROR',
			error: true
		});
	}
};

export const userScore = async (req: Request, res: Response) => {
	const { id, tournament, startDate, endDate } = req.body;

	// Validate ID
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(400).json({ messages: ['Invalid user ID provided'], error: true, code: 'ERROR' });
	}
	if (tournament && !mongoose.Types.ObjectId.isValid(tournament)) {
		return res.status(400).json({ messages: ['Invalid tournament ID provided'], error: true, code: 'ERROR' });
	}

	// Build query
	const query: any = {
		status: 'finished' // Only get finished games
	};

	// Add tournament filter only if provided
	if (tournament) {
		query.tournament = tournament;
	}

	// Date filter
	if (startDate || endDate) {
		query.createdAt = {};
		if (startDate) query.createdAt.$gte = new Date(startDate);
		if (endDate) query.createdAt.$lte = new Date(endDate);
		if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
	}

	// Match games where user is playerOne or playerTwo
	query.$or = [{ playerOne: id }, { playerTwo: id }];

	try {
		const games = await Game.find(query)
			.populate('playerOne', 'name email')
			.populate('playerTwo', 'name email')
			.populate('tournament', 'name') // Customize fields as needed
			.sort({ createdAt: -1 });

		const formattedGames = games.map((game) => {
			const isPlayerOne = game.playerOne._id.toString() === id;
			const myDetails = isPlayerOne ? game.playerOne : game.playerTwo;
			const opponentDetails = isPlayerOne ? game.playerTwo : game.playerOne;
			const myScore = isPlayerOne ? game.score.playerOneScores : game.score.playerTwoScores;
			const opponentScore = isPlayerOne ? game.score.playerTwoScores : game.score.playerOneScores;
			return {
				gameId: game._id,
				myDetails,
				opponentDetails,
				tournamentDetails: game.tournament, // Include populated tournament info
				createdAt: game.createdAt,
				myScore,
				opponentScore
			};
		});

		return res.status(200).json({ games: formattedGames, error: false, code: 'SUCCESS' });
	} catch (error: any) {
		console.error('Error fetching user score:', error);
		return res.status(500).json({
			messages: [error.message],
			code: 'SERVER_ERROR',
			error: true
		});
	}
};

export const userParticipatedTournaments = async (req: Request, res: Response) => {
	const { id } = req.body;

	// Validate ID
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(400).json({ messages: ['Invalid user ID provided'], error: true, code: 'ERROR' });
	}

	try {
		// Find tournaments where user is in participants
		const tournaments = await Tournament.find({ participants: id }, 'name _id').sort({ createdAt: -1 });

		// Format response
		const formattedTournaments = tournaments.map((tournament) => ({
			label: tournament.name,
			value: tournament._id
		}));

		return res.status(200).json({ tournaments: formattedTournaments, error: false, code: 'SUCCESS' });
	} catch (error: any) {
		console.error('Error fetching user tournaments:', error);
		return res.status(500).json({
			messages: [error.message],
			code: 'SERVER_ERROR',
			error: true
		});
	}
};

export const tournamentScore = async (req: Request, res: Response) => {
	const { id } = req.body;
	// Validate ID
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(400).json({ messages: ['Invalid tournament ID provided'], error: true, code: 'ERROR' });
	}
	try {
		// Find tournament and populate schedule
		const tournament = await Tournament.findById(id).populate('schedule').exec();
		if (!tournament || !tournament.schedule) {
			return res.status(404).json({
				messages: ['Tournament or schedule not found'],
				code: 'NOT_FOUND',
				error: true
			});
		}

		// Find the schedule
		const schedule = await Schedule.findById(tournament.schedule._id).exec();
		if (!schedule) {
			return res.status(404).json({
				messages: ['Schedule not found'],
				code: 'SCHEDULE_NOT_FOUND',
				error: true
			});
		}

		// Get all rounds
		const allRounds = schedule.rounds;

		if (!allRounds || allRounds.length === 0) {
			return res.status(404).json({
				messages: ['No rounds found'],
				code: 'ROUND_NOT_FOUND',
				error: true
			});
		}

		// Fetch all games for all rounds
		const games = await Game.find({
			_id: { $in: allRounds.map((round: IRound) => round.game) }
		})
			.populate('playerOne', 'name email hmacKey')
			.populate('playerTwo', 'name email hmacKey')
			.populate('tournament', 'name playMode')
			.sort({ createdAt: 1 });

		// Add round and currentRound to each game
		const gamesWithRound = games.map((game: any) => ({
			...game.toObject(),
			round: allRounds.find((round: any) => round.game.toString() === game._id.toString())?.round,
			currentRound: schedule.currentRound,
			tournamentMode: tournament?.tournamentMode
		}));

		return res.status(200).json({ games: gamesWithRound, error: false, code: 'SUCCESS' });
	} catch (error: any) {
		console.error('Error fetching tournament score:', error);
		return res.status(500).json({
			messages: [error.message],
			code: 'SERVER_ERROR',
			error: true
		});
	}
};

export const getTournamentByIdWithParticipants = async (req: Request, res: Response) => {
	const { tournamentId, userId } = req.query;

	// Validate tournament ID
	if (!mongoose.Types.ObjectId.isValid(tournamentId as string)) {
		return res.status(400).json({
			messages: ['Invalid tournament id provided'],
			error: true,
			code: 'ERROR'
		});
	}

	try {
		// Fetch the tournament by ID and populate `club` and `courts`
		const tournament = await Tournament.findById(tournamentId)
			.populate('club') // Populates the `club` field
			.populate({
				path: 'courts', // Populates the `courts` field
				select: '_id name courtType placement' // Specifies the fields to include
			})
			.populate({
				path: 'participants', // Populates the `user` field of each participant
				select: '_id name alias gender' // Specify which fields to include for users
			});

		if (!tournament) {
			return res.status(404).json({
				messages: ['Tournament not found'],
				error: true,
				code: 'NOT_FOUND'
			});
		}

		// Count participants for the tournament
		const participantsCount = tournament.participants.length;

		// Check if the user is participating
		const participantIds = tournament.participants.map((u: any) => u._id.toString());
		const isParticipating = participantIds.includes(userId?.toString());

		const participants = tournament.participants;

		res.status(200).json({
			tournament: {
				tournament,
				participantsCount,
				isParticipating: isParticipating ? true : false,
				participants
			},
			error: false,
			code: 'SUCCESS'
		});
	} catch (error: any) {
		LogError(__dirname, 'GET', req.originalUrl, error);
		res.status(500).json({
			messages: [error.message],
			code: 'GET_TOURNAMENT_WITH_PARTICIPANTS',
			error: true
		});
	}
};
