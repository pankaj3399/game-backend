import mongoose from 'mongoose';

const HANDOFF_TTL_SECONDS = 120; // 2 minutes

const authHandoffSchema = new mongoose.Schema(
	{
		code: {
			type: String,
			required: true,
			unique: true,
		},
		token: {
			type: String,
			required: true,
		},
		expiresAt: {
			type: Date,
			required: true,
		},
	},
	{ collection: 'auth_handoffs' },
);

authHandoffSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const AuthHandoff = mongoose.model('AuthHandoff', authHandoffSchema);

export { HANDOFF_TTL_SECONDS, AuthHandoff };
