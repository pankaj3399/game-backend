import mongoose from 'mongoose';
import User from '../../../models/User';
import Club from '../../../models/Club';

export async function findClubPlanById(clubId: string) {
	return Club.findById(clubId).select('plan').exec();
}

export async function findUserById(userId: string) {
	return User.findById(userId).exec();
}

export async function addUserAdminOfClub(userId: string, clubId: string) {
	return User.updateOne({ _id: userId, adminOf: { $ne: clubId } }, { $addToSet: { adminOf: clubId } }).exec();
}

export async function addUserAsClubOrganiser(clubId: string, userId: string) {
	return Club.updateOne({ _id: clubId, organiserIds: { $ne: userId } }, { $addToSet: { organiserIds: userId } }).exec();
}
