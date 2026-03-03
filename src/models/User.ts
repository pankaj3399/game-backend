import mongoose, { type HydratedDocument } from 'mongoose';

export interface IElo {
	rating: number;
	tau: number;
	rd: number;
	vol: number;
}

import type { Role } from '../constants/roles';

/** Identity & access: clubs this user admins, tournaments they organize. */
export interface IUser {
	email: string;
	name?: string | null;
	alias?: string | null;
	dateOfBirth?: Date | null;
	gender: "male" | "female" | "other" | null;
	/** RBAC role: Player, Organiser, Club Admin, Super Admin */
	role: Role;
	status: "active" | "inactive" | "banned";
	/** Clubs this user administers. */
	adminOf: mongoose.Types.ObjectId[];
	/** Tournaments this user organizes. */
	organizerOf: mongoose.Types.ObjectId[];
/** Clubs this user has favorited. */
	favoriteClubs: mongoose.Types.ObjectId[];
	/** User's designated home club (must be in favoriteClubs). */
	homeClub: mongoose.Types.ObjectId | null;
	elo: IElo;
	createdAt: Date;
	updatedAt: Date;
	/** Soft delete: when set, user is considered deleted and excluded from queries. */
	deletedAt?: Date | null;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new mongoose.Schema<IUser>(
	{
		alias: {
			type: String,
			default: null
		},
		name: {
			type: String,
			default: null
		},
		email: {
			type: String,
			unique: true,
			required: true,
			validate: {
				validator: function (value: string) {
					return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
				},
				message: 'Invalid email format'
			}
		},
		dateOfBirth: {
			type: Date,
			default: null
		},
		gender: {
			type: String,
			enum: {
				values: ["male", "female", "other"],
				message: "{VALUE} is not supported"
			},
			default: null
		},
		status: {
			type: String,
			enum: {
				values: ["active", "inactive", "banned"],
				message: "{VALUE} is not supported"
			},
			default: "active",
			required: true,
		},
		role: {
			type: String,
			enum: {
				values: ["player", "organiser", "club_admin", "super_admin"],
				message: "{VALUE} is not supported"
			},
			required: true,
			default: "player"
		},
		adminOf: {
			type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Club" }],
			default: []
		},
		organizerOf: {
			type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tournament" }],
			default: []
		},
		favoriteClubs: {
			type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Club" }],
			default: []
		},
		homeClub: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Club",
			default: null
		},
		elo: {
			_id: false,
			rating: {
				type: Number,
				default: 1500,
				required: true
			},
			tau: {
				type: Number,
				default: 0.5,
				required: true
			},
			rd: {
				type: Number,
				default: 200,
				required: true
			},
			vol: {
				type: Number,
				default: 0.06,
				required: true
			}
		},
		deletedAt: {
			type: Date,
			default: null
		}
	},
	{
		timestamps: true,
		collection: 'users'
	}
);

/** Excludes soft-deleted users from find queries. Use query.setOptions({ includeDeleted: true }) to bypass. */
userSchema.pre(/^find/, function (this: mongoose.Query<unknown, HydratedDocument<IUser>>) {
	const opts = this.getOptions() as { includeDeleted?: boolean };
	if (!opts?.includeDeleted) {
		this.where({ $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] });
	}
});

const User = mongoose.model<IUser>('User', userSchema);

export default User;