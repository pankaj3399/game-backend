import mongoose, { Document, Schema } from 'mongoose';

// Define the ICourt interface (to describe the nested court info)
interface ISlots {
	player1: {
		id: string;
		name: string;
		elo: number;
	};
	player2: {
		id: string;
		name: string;
		elo: number;
	};
	court: {
		_id: Schema.Types.ObjectId;
		name: string;
	};
	startTime: Date;
	slot: number;
}
// Define the IScheduler interface
export interface IScheduler extends Document {
	tournament: mongoose.Types.ObjectId;
	currentRound: number;
	slots: ISlots[];
	status: 'active' | 'finished' | 'draft';
}

// Define the scheduler schema
const schedulerSchema = new mongoose.Schema<IScheduler>(
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
		slots: {
			type: [
				{
					player1: {
						id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
						name: { type: String, required: true },
						elo: { type: Number, required: true }
					},
					player2: {
						id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
						name: { type: String, required: true },
						elo: { type: Number, required: true }
					},
					court: {
						_id: { type: Schema.Types.ObjectId, required: true }, // Court reference
						name: { type: String, required: true }
					},
					startTime: { type: Date, required: true },
					slot: { type: Number, required: true }
				}
			],
			required: true
		},
		status: {
			type: String,
			enum: {
				values: ['active', 'finished', 'draft'],
				message: '{VALUE} is not supported'
			},
			default: 'active'
		}
	},
	{
		timestamps: true // Automatically adds createdAt and updatedAt fields
	}
);

const Scheduler = mongoose.models.Scheduler || mongoose.model<IScheduler>('Scheduler', schedulerSchema);

export default Scheduler;
