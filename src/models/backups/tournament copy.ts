import mongoose, { Document, Schema } from 'mongoose';

// Define the ITournament interface
export interface ITournament extends Document {
	club: mongoose.Types.ObjectId;
	name: string;
	logo: string;
	date: Date;
	startTime: string;
	endTime: string;
	playMode: 'tiebreak' | 'tiebreakallinone' | 'tiebreakdeathmode'; // Optional gender
	memberFee: number;
	externalFee: number;
	minMember: number;
	maxMember: number;
	playTime: string;
	pauseTime: string;
	courts: Schema.Types.ObjectId[];
	foodInfo: string;
	descriptionInfo: string;
	numberOfRounds: number;
	status: 'active' | 'draft';
	createdAt?: Date;
	updatedAt?: Date;
}

// Define the Tournament schema
const tournamentSchema = new mongoose.Schema<ITournament>(
	{
		club: {
			type: Schema.Types.ObjectId,
			ref: 'Club',
			required: true
		},
		name: {
			type: String,
			unique: true,
			required: true
		},
		logo: {
			type: String,
			required: true
		},
		date: {
			type: Date,
			required: true
		},
		startTime: {
			type: String,
			required: true
		},
		endTime: {
			type: String,
			required: true
		},
		playMode: {
			type: String,
			enum: {
				values: ['tiebreak', 'tiebreakallinone', 'tiebreakdeathmode'],
				message: '{VALUE} is not supported'
			},
			default: 'tiebreak' // Default value
		},
		memberFee: {
			type: Number,
			required: true,
			min: [0, 'Member fee must be a positive number'], // Validation
			default: 0 // Explicitly set default to 0
		},
		externalFee: {
			type: Number,
			required: true,
			min: [0, 'External fee must be a positive number'], // Validation
			default: 0 // Explicitly set default to 0
		},
		minMember: {
			type: Number,
			required: true,
			min: [1, 'Minimum members must be at least 1'] // Validation
		},
		maxMember: {
			type: Number,
			required: true,
			min: [1, 'Maximum members must be at least 1'] // Validation
		},
		playTime: {
			type: String,
			required: true
		},
		pauseTime: {
			type: String,
			required: true
		},
		courts: {
			type: [Schema.Types.ObjectId], // Array of ObjectIds
			ref: 'Court',
			required: true
		},
		foodInfo: {
			type: String,
			required: true,
			maxlength: 500 // Length constraint
		},
		descriptionInfo: {
			type: String,
			required: true,
			maxlength: 1000 // Length constraint
		},
		numberOfRounds: {
			type: Number,
			required: true
		},
		status: {
			type: String,
			enum: {
				values: ['active', 'draft', 'inactive'],
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'active'
		}
	},
	{
		timestamps: true // Automatically adds createdAt and updatedAt fields
	}
);

tournamentSchema.index({ coordinates: '2dsphere' });

// Export the Court model
const Tournament = mongoose.models.Tournament || mongoose.model<ITournament>('Tournament', tournamentSchema);

export default Tournament;
