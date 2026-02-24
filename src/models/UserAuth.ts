import mongoose, { Document, Schema } from "mongoose";
import crypto from "crypto";

/**
 * Auth/credentials for a user. Kept separate from User (profile) so that
 * provider IDs and secrets are not mixed with profile data.
 * One UserAuth per User (1:1). Supports Google, Apple, and future providers.
 */
export type AuthProvider = "google" | "apple";

export interface IUserAuth extends Document {
	user: mongoose.Types.ObjectId;
	/** Google OAuth subject id */
	googleId?: string | null;
	/** Apple OAuth subject id */
	appleId?: string | null;
	/** App-level HMAC key for this user (e.g. signing). */
	hmacKey: string;
	createdAt: Date;
	updatedAt: Date;
}

const userAuthSchema = new Schema<IUserAuth>(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
			unique: true
		},
		googleId: {
			type: String,
			default: null
		},
		appleId: {
			type: String,
			default: null
		},
		hmacKey: {
			type: String,
			required: true,
			default: function () {
				return crypto.randomBytes(32).toString("hex");
			}
		}
	},
	{ timestamps: true, collection: 'userauths' }
);

// Lookup by provider id when authenticating (unique + sparse: one provider ID per user)
userAuthSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userAuthSchema.index({ appleId: 1 }, { unique: true, sparse: true });

const UserAuth = mongoose.models.UserAuth ?? mongoose.model<IUserAuth>("UserAuth", userAuthSchema);

export default UserAuth;
