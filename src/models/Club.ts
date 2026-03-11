import mongoose, { Schema, type HydratedDocument } from 'mongoose';

export type ClubPlan = 'free' | 'premium';
export type ClubSubscriptionStatus = 'renewal_needed' | 'subscribed' ;

export interface IClub {
	name: string;
	description?: string | null;
	address: string;
	coordinates: {
		type: 'Point';
		coordinates: [number, number]; // [longitude, latitude]
	};
	website?: string | null;
	bookingSystemUrl?: string | null;
	status: 'active' | 'archive';
	/** Users who can organise at this club (club-level organisers). */
	organiserIds: mongoose.Types.ObjectId[];
	/** The default admin for this club (first in admin list). */
	defaultAdminId: mongoose.Types.ObjectId | null;
	/** Subscription plan: free or premium. */
	plan: ClubPlan;
	/** When the subscription expires. Null for free plans with no expiry. */
	expiresAt: Date | null;
	/** Subscription status: renewal_needed or subscribed. */
	subscriptionStatus: ClubSubscriptionStatus;
	createdAt: Date;
	updatedAt: Date;
}

export type ClubDocument = HydratedDocument<IClub>;

const clubSchema = new Schema<IClub>(
	{
		name: {
			type: String,
			unique: true,
			required: true
		},
		description: {
			type: String,
			default: null
		},
		address: {
			type: String,
			required: true
		},
		coordinates: {
			type: {
				type: String,
				enum: ['Point'],
				required: true,
				default: 'Point'
			},
			coordinates: {
				type: [Number],
				required: true,
				validate: {
					validator: function (value: number[]) {
						if (!Array.isArray(value) || value.length !== 2) return false;
						const [lon, lat] = value;
						return (
							typeof lon === 'number' &&
							typeof lat === 'number' &&
							lon >= -180 && lon <= 180 &&
							lat >= -90 && lat <= 90
						);
					},
					message:
						'Coordinates must be [longitude, latitude] and within valid ranges.'
				}
			}
		},
		website: {
			type: String,
			default: null
		},
		bookingSystemUrl: {
			type: String,
			default: null
		},
		status: {
			type: String,
			enum: {
				values: ['active', 'archive'],
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'active'
		},
		organiserIds: {
			type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
			default: []
		},
		defaultAdminId: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			default: null
		},
		plan: {
			type: String,
			enum: { values: ['free', 'premium'], message: '{VALUE} is not supported' },
			default: 'free'
		},
		expiresAt: {
			type: Date,
			default: null
		},
		subscriptionStatus: {
			type: String,
			enum: {
				values: ['renewal_needed', 'subscribed'],
				message: '{VALUE} is not supported'
			},
			default: 'subscribed'
		}
	},
	{
		timestamps: true,
	}
);

clubSchema.index({ coordinates: '2dsphere' });

const Club = mongoose.model<IClub>('Club', clubSchema);

export default Club;
