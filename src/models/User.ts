import mongoose, { Document, model } from "mongoose";

export interface IElo {
	rating: number;
	tau: number;
	rd: number;
	vol: number;
}

/** Identity & access: clubs this user admins, tournaments they organize. */
export interface IUser extends Document {
	email: string;
	name?: string | null;
	alias?: string | null;
	dateOfBirth?: Date | null;
	gender: "male" | "female" | "other" | null;
	userType: "admin" | "user";
	/** Clubs this user administers. */
	adminOf: mongoose.Types.ObjectId[];
	/** Tournaments this user organizes. */
	organizerOf: mongoose.Types.ObjectId[];
	elo: IElo;
	createdAt: Date;
	updatedAt: Date;
}

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
					return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
		userType: {
			type: String,
			enum: {
				values: ["user", "admin"],
				message: "{VALUE} is not supported"
			},
			required: true,
			default: "user"
		},
		adminOf: {
			type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Club" }],
			default: []
		},
		organizerOf: {
			type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tournament" }],
			default: []
		},
		elo: {
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
		}
	},
	{
		timestamps: true,
		collection: 'users'
	}
);





const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);

export default User;