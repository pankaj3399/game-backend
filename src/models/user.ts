import mongoose, { Document } from 'mongoose';
import crypto from 'crypto';

export interface IUser extends Document {
	googleId?: string | null; // Optional, as it might be null if user logs in with Apple
	appleId?: string | null; // Optional, as it might be null if user logs in with Google
	alias?: string | null; // Optional alias for the user
	name: string; // Required user name
	email: string; // Required and unique email
	dateOfBirth?: Date | null; // Optional date of birth
	gender?: 'male' | 'female' | 'other' | null; // Optional gender
	userType: 'user' | 'admin'; // Required user type
	createdAt?: Date; // Automatically managed by timestamps
	updatedAt?: Date; // Automatically managed by timestamps
	hmacKey: string;
	elo: {
		rating: number;
		tau: number;
		rd: number;
		vol: number;
	};
}

const userSchema = new mongoose.Schema(
	{
		googleId: {
			type: String,
			default: null
		},
		appleId: {
			type: String,
			default: null
		},
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
			validate: {
				validator: function (value: string) {
					return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/.test(value);
				},
				message: 'Invalid email format'
			}
		},
		dateOfBirth: {
			type: Date,
			default: null // You can set a default value or leave it optional
		},
		gender: {
			type: String,
			enum: {
				values: ['male', 'female', 'other'],
				message: '{VALUE} is not supported'
			},
			default: null
		},
		userType: {
			type: String,
			enum: {
				values: ['user', 'admin'],
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'user'
		},
		hmacKey: {
			type: String,
			default: function () {
				return crypto.randomBytes(32).toString('hex');
			}
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
		timestamps: true // Automatically adds createdAt and updatedAt fields
	}
);

// Virtual for clubs
userSchema.virtual('clubs', {
	ref: 'Club',
	localField: '_id',
	foreignField: 'user'
});

// Virtual for favorites
userSchema.virtual('favorites', {
	ref: 'Favorite',
	localField: '_id',
	foreignField: 'user'
});

const User = mongoose.models.User || mongoose.model<IUser>('User', userSchema);

export default User;
