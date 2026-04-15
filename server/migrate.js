import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db/pool.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, 'migrations')

async function main() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const f of files) {
    const sqlPath = path.join(migrationsDir, f)
    const sql = fs.readFileSync(sqlPath, 'utf8')
    await pool.query(sql)
    console.log('Migration OK:', sqlPath)
  }
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
