import mongoose, { Document, Schema } from 'mongoose';

// Define the ITournament interface
export interface ITournament extends Document {
	club: mongoose.Types.ObjectId;
	schedule: mongoose.Types.ObjectId;
	name: string;
	logo: string;
	date: Date;
	startTime: string;
	endTime: string;
	playMode: 'TieBreak10' | '1set' | '3setTieBreak10' | '3set' | '5set';
	tournamentMode: 'singleDay' | 'period';
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
	roundTimings: { startDate: Date; endDate: Date }[];
	status: 'active' | 'draft' | 'inactive';
	createdAt?: Date;
	updatedAt?: Date;
	participants: Schema.Types.ObjectId[]; // contains list of participants
	dropouts: Schema.Types.ObjectId[]; // contains list of dropouts a dropout can only exist after the tournament starts (i.e for injury etc)
}

// Define the Tournament schema
const tournamentSchema = new mongoose.Schema<ITournament>(
	{
		club: {
			type: Schema.Types.ObjectId,
			ref: 'Club',
			required: true
		},
		schedule: {
			type: Schema.Types.ObjectId,
			ref: 'Schedule'
		},
		name: {
			type: String,
			unique: true,
			required: true
		},
		logo: {
			type: String,
			required: false
		},
		date: {
			type: Date
		},
		startTime: {
			type: String
		},
		endTime: {
			type: String
		},
		playMode: {
			type: String,
			enum: {
				values: ['TieBreak10', '1set', '3setTieBreak10', '3set', '5set'],
				message: '{VALUE} is not supported'
			},
			default: 'TieBreak10' // Default value
		},
		tournamentMode: {
			type: String,
			enum: {
				values: ['singleDay', 'period'],
				message: '{VALUE} is not supported'
			},
			default: 'singleDay' // Default value
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
			type: String
		},
		pauseTime: {
			type: String
		},
		courts: {
			type: [Schema.Types.ObjectId], // Array of ObjectIds
			ref: 'Court'
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
		roundTimings: {
			type: [
				{
					startDate: { type: Date, required: false },
					endDate: { type: Date, required: false }
				}
			],
			default: []
		},
		status: {
			type: String,
			enum: {
				values: ['active', 'draft', 'inactive'],
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'active'
		},
		participants: {
			type: [
				{
					type: Schema.Types.ObjectId,
					ref: 'User'
				}
			],
			default: []
		},
		dropouts: {
			type: [
				{
					type: Schema.Types.ObjectId,
					ref: 'User'
				}
			],
			default: []
		}
	},
	{
		timestamps: true // Automatically adds createdAt and updatedAt fields
	}
);

// Create schedule document if it doesn't already exist
tournamentSchema.pre('save', async function () {
	if (!this.schedule) {
		// console.log('Trying to save before insert')
		try {
			const _schedule = await mongoose.model('Schedule').create({ tournament: this._id, currentRound: 0 });
			// console.log('Created schedule', _schedule._id)
			this.schedule = _schedule._id;
		} catch (e) {
			throw e;
		}
	}
});

const Tournament = mongoose.models.Tournament ?? mongoose.model<ITournament>('Tournament', tournamentSchema);

export default Tournament;