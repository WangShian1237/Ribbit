import { pool } from './pool.js'

/**
 * @returns {Promise<{ id: string, username: string, password_hash: string, nickname: string } | null>}
 */
export async function getUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, username, password_hash, nickname FROM users WHERE id = $1',
    [id],
  )
  return rows[0] ?? null
}

export async function getUserByUsername(username) {
  const u = typeof username === 'string' ? username.trim().toLowerCase() : ''
  if (!u) return null
  const { rows } = await pool.query(
    'SELECT id, username, password_hash, nickname FROM users WHERE lower(username) = lower($1)',
    [username.trim()],
  )
  return rows[0] ?? null
}

export function userPublic(row) {
  return { id: row.id, username: row.username, nickname: row.nickname }
}

export async function createUser({ username, passwordHash, nickname }) {
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, nickname)
       VALUES ($1, $2, $3)
       RETURNING id, username, nickname`,
      [username.trim(), passwordHash, nickname.trim()],
    )
    return { ok: true, user: rows[0] }
  } catch (e) {
    if (e.code === '23505') return { ok: false, error: '用户名已存在' }
    throw e
  }
}
