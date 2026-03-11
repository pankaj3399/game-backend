import mongoose, { Schema, type HydratedDocument } from 'mongoose';

export type SponsorScope = 'global' | 'club';
export type SponsorStatus = 'active' | 'paused';

export interface ISponsor {
	name: string;
	description?: string | null;
	logoUrl?: string | null;
	link?: string | null;
	scope: SponsorScope;
	clubId: mongoose.Types.ObjectId | null;
	status: SponsorStatus;
	createdAt: Date;
	updatedAt: Date;
}

export type SponsorDocument = HydratedDocument<ISponsor>;

const sponsorSchema = new Schema<ISponsor>(
	{
		name: {
			type: String,
			required: true
		},
		description: {
			type: String,
			default: null
		},
		logoUrl: {
			type: String,
			default: null
		},
		link: {
			type: String,
			default: null
		},
		scope: {
			type: String,
			enum: {
				values: ['global', 'club'],
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'club'
		},
		clubId: {
			type: Schema.Types.ObjectId,
			ref: 'Club',
			default: null
		},
		status: {
			type: String,
			enum: {
				values: ['active', 'paused'],
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'active'
		}
	},
	{
		timestamps: true
	}
);

sponsorSchema.pre('save', function () {
	if (this.scope === 'club' && !this.clubId) {
		throw new Error('clubId is required when scope is "club"');
	}
});

sponsorSchema.index({ clubId: 1 });
sponsorSchema.index({ scope: 1, clubId: 1 });

const Sponsor = mongoose.model<ISponsor>('Sponsor', sponsorSchema);

export default Sponsor;
