import mongoose, { Document, Schema } from 'mongoose';

// Define the ITournament interface
export interface ITournament extends Document {
	club: mongoose.Types.ObjectId;
	schedule?: mongoose.Types.ObjectId;
	sponsorId?: mongoose.Types.ObjectId;
	name: string;
	logo?: string;
	date?: Date;
	startTime?: string;
	endTime?: string;
	playMode: 'TieBreak10' | '1set' | '3setTieBreak10' | '3set' | '5set';
	tournamentMode: 'singleDay' | 'period';
	memberFee: number;
	externalFee: number;
	minMember: number;
	maxMember: number;
	playTime?: string;
	pauseTime?: string;
	courts: mongoose.Types.ObjectId[];
	foodInfo?: string;
	descriptionInfo?: string;
	numberOfRounds?: number;
	roundTimings: { startDate: Date; endDate: Date }[];
	status: 'active' | 'draft' | 'inactive';
	createdAt?: Date;
	updatedAt?: Date;
	participants: mongoose.Types.ObjectId[];
	dropouts: mongoose.Types.ObjectId[];
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
		sponsorId: {
			type: Schema.Types.ObjectId,
			ref: 'Sponsor',
			required: false
		},
		name: {
			type: String,
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
			required: false,
			min: [0, 'Member fee must be a positive number'],
			default: 0
		},
		externalFee: {
			type: Number,
			required: false,
			min: [0, 'External fee must be a positive number'],
			default: 0
		},
		minMember: {
			type: Number,
			required: false,
			min: [1, 'Minimum members must be at least 1'],
			default: 1
		},
		maxMember: {
			type: Number,
			required: false,
			min: [1, 'Maximum members must be at least 1'],
			default: 1
		},
		playTime: {
			type: String
		},
		pauseTime: {
			type: String
		},
		courts: {
			type: [
				{
					type: Schema.Types.ObjectId,
					ref: 'Court'
				}
			],
			default: []
		},
		foodInfo: {
			type: String,
			required: false,
			maxlength: 500,
			default: ''
		},
		descriptionInfo: {
			type: String,
			required: false,
			maxlength: 1000,
			default: ''
		},
		numberOfRounds: {
			type: Number,
			required: false,
			default: 1
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
			default: 'draft'
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
		timestamps: true
	}
);

tournamentSchema.index({ club: 1, status: 1, date: -1, createdAt: -1 });

tournamentSchema.pre('validate', function () {
	if (this.maxMember != null && this.minMember != null && this.maxMember < this.minMember) {
		this.invalidate('maxMember', 'maxMember must be greater than or equal to minMember');
	}
});

// tournamentSchema.pre('save', async function () {
// 	if (!this.schedule) {
// 		const _schedule = await mongoose.model('Schedule').create({ tournament: this._id, currentRound: 0 });
// 		this.schedule = _schedule._id;
// 	}
// });

const Tournament = mongoose.model<ITournament>('Tournament', tournamentSchema);

export default Tournament;