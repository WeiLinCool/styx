import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

const pool = connectionString ? new Pool({ connectionString }) : null;

export const db = pool ? drizzle(pool, { schema }) : null;
export { schema };
