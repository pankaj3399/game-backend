import mongoose, { Document, Schema } from 'mongoose';

export interface IFavorite extends Document {
	user: mongoose.Types.ObjectId;
	club: mongoose.Types.ObjectId;
}

const favoriteSchema = new mongoose.Schema(
	{
		user: {
			type: Schema.Types.ObjectId,
			ref: 'User',
			required: true
		},
		club: {
			type: Schema.Types.ObjectId,
			ref: 'Club',
			required: true
		},
		status: {
			type: String,
			enum: {
				values: ['active', 'inactive'],
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'inactive'
		}
	},
	{
		timestamps: true // Automatically adds createdAt and updatedAt fields
	}
);

const Favorite = mongoose.models.Favorite || mongoose.model<IFavorite>('Favorite', favoriteSchema);

export default Favorite;
