import mongoose, { Document, Schema } from 'mongoose';

export interface IRound {
	game: Schema.Types.ObjectId;
	slot: number;
	round: number;
}

// Define the IScheduler interface
export interface ISchedule extends Document {
	tournament: mongoose.Types.ObjectId;
	currentRound: number;
	rounds: IRound[];
	status: 'active' | 'finished' | 'draft';
}

// Define the scheduler schema
const scheduleSchema = new mongoose.Schema<ISchedule>(
	{
		tournament: {
			type: Schema.Types.ObjectId,
			ref: 'Tournament',
			required: true
		},
		currentRound: {
			type: Number,
			required: true
		},
		rounds: {
			type: [
				{
					game: { type: Schema.Types.ObjectId, ref: 'Game' },
					slot: Number,
					round: Number
				}
			]
		},
		status: {
			type: String,
			enum: {
				values: ['active', 'finished', 'draft'],
				message: '{VALUE} is not supported'
			},
			default: 'draft'
		}
	},
	{
		timestamps: true // Automatically adds createdAt and updatedAt fields
	}
);

const Schedule = mongoose.models.Schedule || mongoose.model<ISchedule>('Schedule', scheduleSchema);

export default Schedule;
