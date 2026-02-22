import 'dotenv/config';
import mongoose, {  Mongoose } from "mongoose";

mongoose.set('strictQuery', true);

export async function connectToDatabase(): Promise<Mongoose> {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not defined in environment variables.");
    

  return mongoose.connect(uri);
}




export const client = await connectToDatabase();