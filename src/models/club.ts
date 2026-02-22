import mongoose, { Document } from 'mongoose';

export interface IClub extends Document {
	name: string | null;
	address: string;
	coordinates: {
		longitude: number;
		latitude: number;
	};
	website?: string;
}

const clubSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Types.ObjectId,
			ref: 'User',
			required: true
		},
		name: {
			type: String,
			unique: true,
			required: true
		},
		address: {
			type: String,
			required: true
		},
		coordinates: {
			type: {
				type: String,
				enum: ['Point'],
				default: 'Point'
			},
			coordinates: {
				type: [Number], // [longitude, latitude]
				required: true,
				validate: {
					validator: (value: number[]) =>
						value.length === 2 && value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90,
					message: 'Coordinates must be [longitude, latitude] and within valid ranges.'
				}
			}
		},
		website: {
			type: String,
			required: false,
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
		}
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true }
	}
);

// Virtual for courts
clubSchema.virtual('courts', {
	ref: 'Court',
	localField: '_id',
	foreignField: 'club'
});

// Virtual for tournaments
clubSchema.virtual('tournaments', {
	ref: 'Tournament',
	localField: '_id',
	foreignField: 'club'
});

clubSchema.index({ coordinates: '2dsphere' });

const Club = mongoose.models.Club || mongoose.model<IClub>('Club', clubSchema);

export default Club;
