import mongoose, { Document, Schema } from 'mongoose';

// Define the ICourt interface
export interface ICourt extends Document {
	club: mongoose.Types.ObjectId;
	name: string;
	courtType: 'grass' | 'clay' | 'concrete' | 'carpet' | 'asphalt' | 'other';
	placement: 'indoor' | 'outdoor';
	createdAt?: Date;
	updatedAt?: Date;
}

// Define the court schema
const courtSchema = new mongoose.Schema<ICourt>(
	{
		club: {
			type: Schema.Types.ObjectId,
			ref: 'Club',
			required: true
		},
		name: {
			type: String,
			required: [true, 'Court name is required']
		},
		courtType: {
			type: String,
			enum: {
				values: ['grass', 'clay', 'concrete', 'carpet', 'asphalt', 'other'],
				message: '{VALUE} is not supported'
			},
			required: true
		},
		placement: {
			type: String,
			enum: {
				values: ['indoor', 'outdoor'],
				message: '{VALUE} is not supported'
			},
			required: true
		}
	},
	{
		timestamps: true // Automatically adds createdAt and updatedAt fields
	}
);

// Export the Court model
const Court = mongoose.models.Court || mongoose.model<ICourt>('Court', courtSchema);

export default Court;
