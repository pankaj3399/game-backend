import mongoose, { Schema } from 'mongoose';
export interface IClub {
	name: string;
	address: string;
	coordinates: {
		type: 'Point';
		coordinates: [number, number]; // [longitude, latitude]
	};
	website: string | null;
	status: 'active' | 'archive';
	createdAt: Date;
	updatedAt: Date;
}
const clubSchema = new Schema<IClub>(
	{
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
			required: true,
			type: {
				type: String,
				enum: ['Point'],
				default: 'Point'
			},
			coordinates: {
				type: [Number], // [longitude, latitude]
				required: true,
				validate: {
					validator: (value: number[]) => {
						if (value.length !== 2) return false;
						const lon = value[0];
						const lat = value[1];
						if (lon === undefined || lat === undefined) return false;
						return (
							lon >= -180 &&
							lon <= 180 &&
							lat >= -90 &&
							lat <= 90
						);
					},
					message:
						'Coordinates must be [longitude, latitude] and within valid ranges.'
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
	}
);

clubSchema.index({ coordinates: '2dsphere' });

const Club = mongoose.model<IClub>('Club', clubSchema);

export default Club;
