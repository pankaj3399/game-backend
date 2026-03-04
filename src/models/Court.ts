import mongoose, { Schema, type HydratedDocument } from 'mongoose';

export type CourtType = 'concrete' | 'clay' | 'hard' | 'grass' | 'carpet' | 'other';
export type CourtPlacement = 'indoor' | 'outdoor';

export interface ICourt {
	club: mongoose.Types.ObjectId;
	name: string;
	type: CourtType;
	placement: CourtPlacement;
	createdAt: Date;
	updatedAt: Date;
}

export type CourtDocument = HydratedDocument<ICourt>;

const courtSchema = new Schema<ICourt>(
	{
		club: {
			type: Schema.Types.ObjectId,
			ref: 'Club',
			required: true
		},
		name: {
			type: String,
			required: true
		},
		type: {
			type: String,
			enum: {
				values: ['concrete', 'clay', 'hard', 'grass', 'carpet', 'other'],
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'concrete'
		},
		placement: {
			type: String,
			enum: {
				values: ['indoor', 'outdoor'],
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'outdoor'
		}
	},
	{
		timestamps: true
	}
);

courtSchema.index({ club: 1 });

const Court = mongoose.model<ICourt>('Court', courtSchema);

export default Court;
