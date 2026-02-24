import mongoose from "mongoose";

export interface ISession extends mongoose.Document {
	token: string;
	user: mongoose.Types.ObjectId;
	expireAt: Date;
}

const SessionSchema = new mongoose.Schema<ISession>(
	{
		token: {
			type: String,
			required: true,
			unique: true
		},
		user: {
			type: mongoose.Types.ObjectId,
			ref: "User",
			required: true
		},
		expireAt: { type: Date, default: Date.now, expires: 604800 } // 7 days
	},
	{ timestamps: false }
);

const Session =
	(mongoose.models.Session as mongoose.Model<ISession>) ||
	mongoose.model<ISession>("Session", SessionSchema);

export default Session;