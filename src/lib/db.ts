import 'dotenv/config';
import mongoose, { Mongoose } from 'mongoose';

mongoose.set('strictQuery', true);

export async function connectToDatabase(): Promise<Mongoose> {
	const uri = process.env.MONGODB_URI;
	if (!uri) throw new Error('MONGODB_URI is not defined in environment variables.');

	const dbName = process.env.MONGODB_DB_NAME;
	const opts = dbName ? { dbName } : {};
	return mongoose.connect(uri, opts);
}