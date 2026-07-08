import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';
import * as identitySchema from './schema/identity.schema';

const schema = { ...identitySchema };

const queryClient = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
