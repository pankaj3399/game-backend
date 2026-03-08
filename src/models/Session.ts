import mongoose from 'mongoose';

const SESSION_TTL_SECONDS = 604800; // 7 days

const sessionSchema = new mongoose.Schema(
	{
		tokenHash: {
			type: String,
			required: true,
			unique: true
		},
		// Legacy raw session tokens may still exist in older documents until they expire.
		token: {
			type: String,
			unique: true,
			sparse: true,
			select: false,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true
		},
		expireAt: {
			type: Date,
			default: Date.now,
			expires: SESSION_TTL_SECONDS
		}
	},
	{ collection: 'sessions' }
);

const Session = mongoose.model('Session', sessionSchema);
export default Session;
