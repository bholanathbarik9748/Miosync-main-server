import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
  synchronize: true, // Set to false in production
  // Fallback to individual vars if DATABASE_URL is not set
  ...(process.env.DATABASE_URL
    ? {}
    : {
        host: process.env.PGHOST,
        port: parseInt(process.env.PGPORT || '5432', 10),
        username: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
      }),
});
