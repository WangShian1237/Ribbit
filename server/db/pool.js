import pg from 'pg'

const { Pool } = pg

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('Missing DATABASE_URL. Set it in server/.env (see .env.example).')
  process.exit(1)
}

export const pool = new Pool({ connectionString })
