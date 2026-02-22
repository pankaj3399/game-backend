import mongoose, { Document, Schema } from 'mongoose';

export interface IParticipant extends Document {
	user: mongoose.Types.ObjectId;
	tournament: mongoose.Types.ObjectId;
	order: number;
}

const participantSchema = new mongoose.Schema(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true
		},
		tournament: {
			type: Schema.Types.ObjectId,
			ref: 'Tournament',
			required: true
		},
		order: {
			type: Number,
			required: true
		}
	},
	{
		timestamps: true
	}
);

const Participant = mongoose.models.Participant || mongoose.model<IParticipant>('Participant', participantSchema);

export default Participant;
