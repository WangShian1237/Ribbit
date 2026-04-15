import { pool } from './pool.js'

export async function createGroup(ownerId, name) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed || trimmed.length > 64) return { ok: false, error: '群名称 1–64 字' }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `INSERT INTO groups (name, owner_id) VALUES ($1, $2) RETURNING id, name, owner_id, created_at`,
      [trimmed, ownerId],
    )
    const g = rows[0]
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [g.id, ownerId],
    )
    await client.query('COMMIT')
    return { ok: true, group: g }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function listGroupsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT g.id, g.name, g.owner_id, g.created_at
     FROM groups g
     INNER JOIN group_members m ON m.group_id = g.id AND m.user_id = $1
     ORDER BY g.name`,
    [userId],
  )
  return rows
}

export async function getGroup(groupId) {
  const { rows } = await pool.query('SELECT * FROM groups WHERE id = $1', [groupId])
  return rows[0] ?? null
}

export async function isMember(groupId, userId) {
  const { rows } = await pool.query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
  )
  return rows.length > 0
}

export async function isOwner(groupId, userId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND role = 'owner'`,
    [groupId, userId],
  )
  return rows.length > 0
}

export async function listMembers(groupId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.nickname, m.role, m.joined_at
     FROM group_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.group_id = $1
     ORDER BY m.role DESC, u.nickname`,
    [groupId],
  )
  return rows
}

export async function addMember(groupId, userId, role = 'member') {
  try {
    await pool.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)`,
      [groupId, userId, role],
    )
    return { ok: true }
  } catch (e) {
    if (e.code === '23505') return { ok: false, error: '已在群内' }
    throw e
  }
}

export async function leaveGroup(groupId, userId) {
  const g = await getGroup(groupId)
  if (!g) return { ok: false, error: '群不存在' }
  if (g.owner_id === userId) {
    await pool.query('DELETE FROM groups WHERE id = $1', [groupId])
    return { ok: true, dissolved: true }
  }
  const r = await pool.query(
    'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING 1',
    [groupId, userId],
  )
  if (r.rowCount === 0) return { ok: false, error: '不在群内' }
  return { ok: true, dissolved: false }
}

export function groupRoomId(groupUuid) {
  return `group:${groupUuid}`
}

export function parseGroupRoomId(roomId) {
  if (typeof roomId !== 'string' || !roomId.startsWith('group:')) return null
  return roomId.slice(6) || null
}

export async function createGroupInvite(groupId, inviterId, toUserId) {
  if (inviterId === toUserId) return { ok: false, error: '不能邀请自己' }
  const g = await getGroup(groupId)
  if (!g) return { ok: false, error: '群不存在' }
  if (g.owner_id !== inviterId) return { ok: false, error: '仅群主可邀请' }
  if (await isMember(groupId, toUserId)) return { ok: false, error: '对方已在群内' }
  try {
    const { rows } = await pool.query(
      `INSERT INTO group_invites (group_id, inviter_id, to_user_id)
       VALUES ($1, $2, $3)
       RETURNING id, group_id, inviter_id, to_user_id, created_at`,
      [groupId, inviterId, toUserId],
    )
    return { ok: true, invite: rows[0] }
  } catch (e) {
    if (e.code === '23505') return { ok: false, error: '已有待处理的入群邀请' }
    throw e
  }
}

export async function listIncomingGroupInvites(userId) {
  const { rows } = await pool.query(
    `SELECT i.id, i.group_id, i.created_at,
            g.name AS group_name,
            u.username AS inviter_username, u.nickname AS inviter_nickname
     FROM group_invites i
     JOIN groups g ON g.id = i.group_id
     JOIN users u ON u.id = i.inviter_id
     WHERE i.to_user_id = $1
     ORDER BY i.created_at DESC`,
    [userId],
  )
  return rows
}

export async function getGroupInviteById(inviteId) {
  const { rows } = await pool.query('SELECT * FROM group_invites WHERE id = $1', [inviteId])
  return rows[0] ?? null
}

export async function acceptGroupInvite(inviteId, userId) {
  const inv = await getGroupInviteById(inviteId)
  if (!inv) return { ok: false, error: '邀请不存在' }
  if (inv.to_user_id !== userId) return { ok: false, error: '无权操作' }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')`,
      [inv.group_id, userId],
    )
    await client.query('DELETE FROM group_invites WHERE id = $1', [inviteId])
    await client.query('COMMIT')
    const g = await getGroup(inv.group_id)
    return { ok: true, groupId: inv.group_id, group: g }
  } catch (e) {
    await client.query('ROLLBACK')
    if (e.code === '23505') return { ok: false, error: '已在群内' }
    throw e
  } finally {
    client.release()
  }
}

export async function rejectGroupInvite(inviteId, userId) {
  const r = await pool.query(
    `DELETE FROM group_invites WHERE id = $1 AND to_user_id = $2 RETURNING id`,
    [inviteId, userId],
  )
  if (r.rowCount === 0) return { ok: false, error: '邀请不存在或已处理' }
  return { ok: true }
}
