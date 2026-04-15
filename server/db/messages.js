import { pool } from './pool.js'

/**
 * @param {{ id: string, roomId: string, userId: string, nickname: string, body: string }} row
 */
function rowToWire(r) {
  return {
    id: r.id,
    roomId: r.room_id,
    userId: r.user_id,
    nickname: r.nickname,
    body: r.body,
    ts: new Date(r.created_at).getTime(),
  }
}

/**
 * @param {{ id: string, roomId: string, userId: string, nickname: string, body: string }} msg
 */
export async function insertMessage(msg) {
  const { rows } = await pool.query(
    `INSERT INTO messages (id, room_id, user_id, nickname, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, room_id, user_id, nickname, body, created_at`,
    [msg.id, msg.roomId, msg.userId, msg.nickname, msg.body],
  )
  return rowToWire(rows[0])
}

/**
 * 返回按时间正序的消息（最多 limit 条，取该房间最新若干条）
 */
export async function listMessagesForRoom(roomId, limit = 200) {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT id, room_id, user_id, nickname, body, created_at
       FROM messages WHERE room_id = $1
       ORDER BY created_at DESC
       LIMIT $2
     ) sub ORDER BY created_at ASC`,
    [roomId, limit],
  )
  return rows.map(rowToWire)
}
