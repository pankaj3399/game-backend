import mongoose, { Types } from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ROLES, type Role } from '../../constants/roles';
import Club from '../../models/Club';
import Court from '../../models/Court';
import Game, { type IGameTeam } from '../../models/Game';
import Schedule from '../../models/Schedule';
import Session from '../../models/Session';
import Sponsor from '../../models/Sponsor';
import Tournament from '../../models/Tournament';
import User, { type UserDocument } from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { createAuthToken, hashSessionToken } from '../../lib/jwtAuth';

let replSet: MongoMemoryReplSet | null = null;
let sequence = 0;

function nextLabel(prefix: string) {
	sequence += 1;
	return `${prefix}-${sequence}`;
}

export function setupMemoryMongo() {
	beforeAll(async () => {
		process.env.JWT_SECRET ??= 'test-jwt-secret';
		replSet = await MongoMemoryReplSet.create({
			replSet: { count: 1 },
			instanceOpts: [{ storageEngine: 'wiredTiger' }],
		});
		await mongoose.connect(replSet.getUri(), { dbName: 'game-backend-test' });
		await mongoose.connection.syncIndexes();
	});

	afterEach(async () => {
		await clearCollections();
	});

	afterAll(async () => {
		await mongoose.disconnect();
		await replSet?.stop();
		replSet = null;
	});
}

export async function clearCollections() {
	const collections = mongoose.connection.collections;
	await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

export async function createUser(overrides: Partial<{
	_id: Types.ObjectId;
	email: string;
	name: string | null;
	alias: string | null;
	role: Role;
	adminOf: Types.ObjectId[];
	organizerOf: Types.ObjectId[];
}> = {}) {
	return User.create({
		email: overrides.email ?? `${nextLabel('user')}@example.com`,
		name: overrides.name ?? 'Test User',
		alias: overrides.alias ?? null,
		gender: null,
		role: overrides.role ?? ROLES.PLAYER,
		adminOf: overrides.adminOf ?? [],
		organizerOf: overrides.organizerOf ?? [],
		...(overrides._id ? { _id: overrides._id } : {}),
	});
}

export async function createUserAuth(userId: Types.ObjectId, overrides: Partial<{
	googleId: string | null;
	appleId: string | null;
	hmacKey: string;
}> = {}) {
	return UserAuth.create({
		user: userId,
		googleId: overrides.googleId,
		appleId: overrides.appleId,
		...(overrides.hmacKey ? { hmacKey: overrides.hmacKey } : {}),
	});
}

export async function createSession(user?: UserDocument) {
	if (!process.env.JWT_SECRET) {
		throw new Error('JWT_SECRET is not configured');
	}
	const sessionUser = user ?? (await createUser());
	if (!(await UserAuth.exists({ user: sessionUser._id }))) {
		await createUserAuth(sessionUser._id);
	}
	const token = await createAuthToken(sessionUser);
	return {
		token,
		authorization: `Bearer ${token}`,
		user: sessionUser,
		session: await Session.findOne({ token: hashSessionToken(token) }).select('+token').orFail(),
	};
}

export async function createClub(overrides: Partial<{
	_id: Types.ObjectId;
	name: string;
	address: string;
	defaultAdminId: Types.ObjectId | null;
	organiserIds: Types.ObjectId[];
	plan: 'free' | 'premium';
}> = {}) {
	return Club.create({
		name: overrides.name ?? nextLabel('Club'),
		address: overrides.address ?? '123 Test Street',
		coordinates: { type: 'Point', coordinates: [77.5946, 12.9716] },
		status: 'active',
		defaultAdminId: overrides.defaultAdminId ?? null,
		organiserIds: overrides.organiserIds ?? [],
		plan: overrides.plan ?? 'free',
		...(overrides._id ? { _id: overrides._id } : {}),
	});
}

export async function seedClubAdmin(overrides: Partial<{
	userId: Types.ObjectId;
	clubId: Types.ObjectId;
	role: Role;
	plan: 'free' | 'premium';
}> = {}) {
	const user = await createUser({
		_id: overrides.userId,
		role: overrides.role ?? ROLES.CLUB_ADMIN,
	});
	const club = await createClub({
		_id: overrides.clubId,
		defaultAdminId: user._id,
		plan: overrides.plan ?? 'premium',
	});
	user.adminOf = [club._id];
	await user.save();
	return { user, club };
}

export async function seedOrganiserForClub(overrides: Partial<{
	userId: Types.ObjectId;
	clubId: Types.ObjectId;
	role: Role;
	plan: 'free' | 'premium';
}> = {}) {
	const user = await createUser({
		_id: overrides.userId,
		role: overrides.role ?? ROLES.ORGANISER,
	});
	const club = await createClub({
		_id: overrides.clubId,
		organiserIds: [user._id],
		plan: overrides.plan ?? 'premium',
	});
	user.organizerOf = [club._id];
	await user.save();
	return { user, club };
}

export async function createCourt(clubId: Types.ObjectId, overrides: Partial<{ name: string }> = {}) {
	return Court.create({
		club: clubId,
		name: overrides.name ?? nextLabel('Court'),
		type: 'hard',
		placement: 'outdoor',
	});
}

export async function createTournament(overrides: Partial<{
	_id: Types.ObjectId;
	club: Types.ObjectId;
	createdBy: Types.ObjectId;
	name: string;
	status: 'draft' | 'active' | 'inactive';
	participants: Types.ObjectId[];
	maxMember: number;
	minMember: number;
	totalRounds: number;
	completedAt: Date | null;
	playMode: 'TieBreak10' | '1set' | '3setTieBreak10' | '3set' | '5set';
}> = {}) {
	const creator = overrides.createdBy ?? (await createUser())._id;
	const club = overrides.club ?? (await createClub())._id;
	const tournament = await Tournament.create({
		club,
		createdBy: creator,
		name: overrides.name ?? nextLabel('Tournament'),
		status: overrides.status ?? 'active',
		tournamentMode: 'singleDay',
		playMode: overrides.playMode ?? 'TieBreak10',
		date: new Date('2026-01-15T00:00:00.000Z'),
		startTime: '09:00',
		endTime: '12:00',
		timezone: 'UTC',
		entryFee: 0,
		minMember: overrides.minMember ?? 1,
		maxMember: overrides.maxMember ?? 8,
		totalRounds: overrides.totalRounds ?? 1,
		duration: 60,
		breakDuration: 0,
		participants: overrides.participants ?? [],
		completedAt: overrides.completedAt ?? null,
		...(overrides._id ? { _id: overrides._id } : {}),
	});

	return Tournament.findById(tournament._id).orFail();
}

export async function createSponsor(overrides: Partial<{
	_id: Types.ObjectId;
	name: string;
	description: string | null;
	logoUrl: string | null;
	link: string | null;
	scope: 'club' | 'global';
	club: Types.ObjectId | null;
	status: 'active' | 'paused';
}> = {}) {
	return Sponsor.create({
		name: overrides.name ?? nextLabel('Sponsor'),
		description: overrides.description ?? null,
		logoUrl: overrides.logoUrl ?? null,
		link: overrides.link ?? null,
		scope: overrides.scope ?? 'club',
		club: overrides.scope === 'global' ? null : overrides.club ?? (await createClub())._id,
		status: overrides.status ?? 'active',
		...(overrides._id ? { _id: overrides._id } : {}),
	});
}

function snapshot(player: Types.ObjectId) {
	return { player, rating: 1500, rd: 200, vol: 0.06, tau: 0.5 };
}

function buildSide(players: Types.ObjectId[]): IGameTeam {
	return {
		players,
		playerSnapshots: players.map(snapshot),
	};
}

export async function createGame(overrides: Partial<{
	tournament: Types.ObjectId;
	schedule: Types.ObjectId;
	side1Players: Types.ObjectId[];
	side2Players: Types.ObjectId[];
	status: 'active' | 'pendingScore' | 'finished' | 'cancelled';
	playMode: 'TieBreak10' | '1set' | '3setTieBreak10' | '3set' | '5set';
}> = {}) {
	const side1Players = overrides.side1Players ?? [(await createUser())._id];
	const side2Players = overrides.side2Players ?? [(await createUser())._id];

	return Game.create({
		tournament: overrides.tournament,
		schedule: overrides.schedule,
		side1: buildSide(side1Players),
		side2: buildSide(side2Players),
		score: { playerOneScores: [], playerTwoScores: [] },
		status: overrides.status ?? 'active',
		gameMode: 'tournament',
		matchType: 'singles',
		playMode: overrides.playMode ?? 'TieBreak10',
	});
}

export async function createSchedule(tournamentId: Types.ObjectId, gameId: Types.ObjectId, overrides: Partial<{
	currentRound: number;
	status: 'draft' | 'active' | 'finished';
}> = {}) {
	const result = await Schedule.findOneAndUpdate(
		{ tournament: tournamentId },
		{
			$set: {
				currentRound: overrides.currentRound ?? 1,
				matchesPerPlayer: 1,
				status: overrides.status ?? 'active',
				rounds: [{ game: gameId, slot: 1, round: 1, mode: 'singles' }],
			},
		},
		{ upsert: true, includeResultMetadata: true, returnDocument: 'after', runValidators: true },
	);
	if (!result.value) {
		throw new Error('Failed to create or update schedule');
	}
	const created = Boolean(result.lastErrorObject?.upserted);
	return { schedule: result.value, created };
}

export async function seedActiveTournamentWithMatch(overrides: Partial<{
	club: Types.ObjectId;
	createdBy: Types.ObjectId;
	participants: Types.ObjectId[];
	playMode: 'TieBreak10' | '1set' | '3setTieBreak10' | '3set' | '5set';
	status: 'active' | 'pendingScore' | 'finished' | 'cancelled';
}> = {}) {
	const side1 = overrides.participants?.[0] ? [overrides.participants[0]] : undefined;
	const side2 = overrides.participants?.[1] ? [overrides.participants[1]] : undefined;
	const tournament = await createTournament({
		club: overrides.club,
		createdBy: overrides.createdBy,
		participants: overrides.participants ?? [],
		status: 'active',
		playMode: overrides.playMode,
	});
	const game = await createGame({
		tournament: tournament._id,
		side1Players: side1,
		side2Players: side2,
		playMode: overrides.playMode,
		status: overrides.status ?? 'active',
	});
	const { schedule } = await createSchedule(tournament._id, game._id);
	game.schedule = schedule._id;
	await game.save();
	tournament.schedule = schedule._id;
	await tournament.save();
	return { tournament: await Tournament.findById(tournament._id).orFail(), game, schedule };
}
