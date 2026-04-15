import { pool } from './pool.js'

function orderedPair(a, b) {
  return a < b ? [a, b] : [b, a]
}

export async function areFriends(userId1, userId2) {
  if (userId1 === userId2) return false
  const [user_a, user_b] = orderedPair(userId1, userId2)
  const { rows } = await pool.query(
    'SELECT 1 FROM friendships WHERE user_a = $1 AND user_b = $2',
    [user_a, user_b],
  )
  return rows.length > 0
}

export async function listFriends(userId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.nickname FROM users u
     INNER JOIN (
       SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS fid
       FROM friendships WHERE user_a = $1 OR user_b = $1
     ) f ON u.id = f.fid
     ORDER BY u.nickname`,
    [userId],
  )
  return rows
}

export async function createFriendRequest(fromUserId, toUserId) {
  if (fromUserId === toUserId) return { ok: false, error: '不能添加自己' }
  const [a, b] = orderedPair(fromUserId, toUserId)
  const friends = await areFriends(fromUserId, toUserId)
  if (friends) return { ok: false, error: '已是好友' }

  const pending = await pool.query(
    `SELECT id FROM friend_requests
     WHERE status = 'pending' AND (
       (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)
     )`,
    [fromUserId, toUserId],
  )
  if (pending.rows.length > 0) return { ok: false, error: '已有待处理请求' }

  try {
    const { rows } = await pool.query(
      `INSERT INTO friend_requests (from_user_id, to_user_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING id, from_user_id, to_user_id, created_at`,
      [fromUserId, toUserId],
    )
    return { ok: true, request: rows[0] }
  } catch (e) {
    if (e.code === '23505') return { ok: false, error: '已有待处理请求' }
    throw e
  }
}

export async function listIncoming(userId) {
  const { rows } = await pool.query(
    `SELECT r.id, r.from_user_id, r.created_at, u.username, u.nickname
     FROM friend_requests r
     JOIN users u ON u.id = r.from_user_id
     WHERE r.to_user_id = $1 AND r.status = 'pending'
     ORDER BY r.created_at DESC`,
    [userId],
  )
  return rows
}

export async function listOutgoing(userId) {
  const { rows } = await pool.query(
    `SELECT r.id, r.to_user_id, r.created_at, u.username, u.nickname
     FROM friend_requests r
     JOIN users u ON u.id = r.to_user_id
     WHERE r.from_user_id = $1 AND r.status = 'pending'
     ORDER BY r.created_at DESC`,
    [userId],
  )
  return rows
}

export async function getRequestById(requestId) {
  const { rows } = await pool.query('SELECT * FROM friend_requests WHERE id = $1', [requestId])
  return rows[0] ?? null
}

export async function acceptRequest(requestId, currentUserId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT * FROM friend_requests WHERE id = $1 AND to_user_id = $2 AND status = 'pending' FOR UPDATE`,
      [requestId, currentUserId],
    )
    const req = rows[0]
    if (!req) {
      await client.query('ROLLBACK')
      return { ok: false, error: '请求不存在或已处理' }
    }
    const [ua, ub] = orderedPair(req.from_user_id, req.to_user_id)
    await client.query(
      `INSERT INTO friendships (user_a, user_b) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [ua, ub],
    )
    await client.query(`DELETE FROM friend_requests WHERE id = $1`, [requestId])
    await client.query(`DELETE FROM friend_requests WHERE status = 'pending' AND (
      (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)
    )`, [req.from_user_id, req.to_user_id])
    await client.query('COMMIT')
    return { ok: true, fromUserId: req.from_user_id, toUserId: req.to_user_id }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function rejectRequest(requestId, currentUserId) {
  const r = await pool.query(
    `DELETE FROM friend_requests WHERE id = $1 AND to_user_id = $2 AND status = 'pending' RETURNING id`,
    [requestId, currentUserId],
  )
  if (r.rowCount === 0) return { ok: false, error: '请求不存在或已处理' }
  return { ok: true }
}
