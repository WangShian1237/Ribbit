/**
 * One-time: import server/data/users.json into PostgreSQL if users table is empty.
 * Run: node scripts/import-json-users.js (from server directory, after migrate)
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../db/pool.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const jsonPath = path.join(__dirname, '..', 'data', 'users.json')

async function main() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM users')
  if (rows[0].c > 0) {
    console.log('users table not empty, skip import')
    await pool.end()
    return
  }
  if (!fs.existsSync(jsonPath)) {
    console.log('No users.json at', jsonPath)
    await pool.end()
    return
  }
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const list = Array.isArray(raw.users) ? raw.users : []
  for (const u of list) {
    if (!u.id || !u.username || !u.passwordHash) continue
    await pool.query(
      `INSERT INTO users (id, username, password_hash, nickname)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.username, u.passwordHash, u.nickname || u.username],
    )
  }
  console.log('Imported', list.length, 'users from JSON')
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
