import 'dotenv/config';
import express from 'express';
import { connectToDatabase } from './lib/db';

const PORT = process.env.PORT || 4000;

const app = express();

app.get('/', (req, res) => {
  res.send('Hello World');
});

async function start() {
  try {
    await connectToDatabase();
    console.log('Database connected');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();