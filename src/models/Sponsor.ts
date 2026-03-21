import mongoose, { Schema, type HydratedDocument } from 'mongoose';
import {
	SPONSOR_SCOPES,
	SPONSOR_STATUSES,
	type SponsorScope,
	type SponsorStatus
} from '../types/domain/sponsor';

export interface ISponsor {
	name: string;
	description?: string | null;
	logoUrl?: string | null;
	link?: string | null;
	scope: SponsorScope;
	club: mongoose.Types.ObjectId | null;
	status: SponsorStatus;
	createdAt: Date;
	updatedAt: Date;
}

export type SponsorDocument = HydratedDocument<ISponsor>;

const sponsorSchema = new Schema<ISponsor>(
	{
		name: {
			type: String,
			required: true,
			unique: true
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
				values: SPONSOR_SCOPES,
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'club'
		},
		club: {
			type: Schema.Types.ObjectId,
			ref: 'Club',
			default: null
		},
		status: {
			type: String,
			enum: {
				values: SPONSOR_STATUSES,
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
	if (this.scope === 'club' && !this.club) {
		throw new Error('club is required when scope is "club"');
	}
});

sponsorSchema.index({ club: 1 });
sponsorSchema.index({ scope: 1, club: 1 });

const Sponsor = mongoose.model<ISponsor>('Sponsor', sponsorSchema);

export default Sponsor;
