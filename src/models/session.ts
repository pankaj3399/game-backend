import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
	token: {
		type: String,
		required: true
	},
	user: {
		type: mongoose.Types.ObjectId,
		ref: 'User',
		required: true
	},
	expireAt: { type: Date, default: Date.now, expires: 604800 } // 604800 seconds = 7 days
});

const Session = mongoose.models.Session || mongoose.model('Session', SessionSchema);

export default Session;
