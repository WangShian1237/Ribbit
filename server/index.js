import 'dotenv/config'
import http from 'node:http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { Server } from 'socket.io'
import { randomUUID } from 'node:crypto'
import * as users from './db/users.js'
import * as friends from './db/friends.js'
import * as groups from './db/groups.js'
import * as messageStore from './db/messages.js'

const PORT = Number(process.env.PORT) || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'ribbit-dev-secret-change-in-production'
const MAX_MSG_PER_ROOM = 200

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{3,20}$/

function validateUsername(s) {
  return typeof s === 'string' && USERNAME_RE.test(s.trim())
}

function validatePassword(s) {
  return typeof s === 'string' && s.length >= 6 && s.length <= 128
}

function validateNickname(s) {
  const t = typeof s === 'string' ? s.trim() : ''
  return t.length >= 1 && t.length <= 32
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' })
}

/** @type {Map<string, { id: string, nickname: string, socketIds: Set<string> }>} */
const presence = new Map()

function dmRoomId(a, b) {
  const [x, y] = [a, b].sort()
  return `dm:${x}:${y}`
}

function emitToUser(io, userId, event, data) {
  const p = presence.get(userId)
  if (!p) return
  for (const sid of p.socketIds) {
    io.to(sid).emit(event, data)
  }
}

function broadcastOnline(io) {
  const list = [...presence.values()].map((u) => ({
    id: u.id,
    nickname: u.nickname,
  }))
  io.emit('online_users', list)
}

const app = express()
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '32kb' }))

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
})

app.get('/', (_req, res) => {
  res.type('text/plain; charset=utf-8').send(
    'Ribbit API。前端开发：http://localhost:5173 。健康检查：GET /api/health ，就绪：GET /api/ready',
  )
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/ready', async (_req, res) => {
  try {
    const { pool } = await import('./db/pool.js')
    await pool.query('SELECT 1')
    res.json({ ok: true })
  } catch {
    res.status(503).json({ ok: false })
  }
})

const httpServer = http.createServer(app)
const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
})

async function authMiddleware(req, res, next) {
  const h = req.headers.authorization
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null
  if (!token) {
    res.status(401).json({ ok: false, error: '未登录' })
    return
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const uid = typeof payload.sub === 'string' ? payload.sub : null
    if (!uid) {
      res.status(401).json({ ok: false, error: '无效令牌' })
      return
    }
    const user = await users.getUserById(uid)
    if (!user) {
      res.status(401).json({ ok: false, error: '用户不存在' })
      return
    }
    req.user = users.userPublic(user)
    next()
  } catch {
    res.status(401).json({ ok: false, error: '登录已失效' })
  }
}

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.user })
})

app.post('/api/register', authLimiter, async (req, res) => {
  try {
    const { username, password, nickname } = req.body ?? {}
    if (!validateUsername(username)) {
      res.status(400).json({ ok: false, error: '用户名须为 3–20 位字母、数字、下划线或中文' })
      return
    }
    if (!validatePassword(password)) {
      res.status(400).json({ ok: false, error: '密码长度须为 6–128 位' })
      return
    }
    const nick =
      typeof nickname === 'string' && nickname.trim()
        ? nickname.trim()
        : String(username).trim()
    if (!validateNickname(nick)) {
      res.status(400).json({ ok: false, error: '昵称长度须为 1–32 字' })
      return
    }
    const passwordHash = bcrypt.hashSync(password, 10)
    const result = await users.createUser({
      username: String(username).trim(),
      passwordHash,
      nickname: nick,
    })
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error })
      return
    }
    const token = signToken(result.user.id)
    res.json({ ok: true, token, user: result.user })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body ?? {}
    if (!username || !password) {
      res.status(400).json({ ok: false, error: '请输入用户名和密码' })
      return
    }
    const user = await users.getUserByUsername(String(username))
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ ok: false, error: '用户名或密码错误' })
      return
    }
    const token = signToken(user.id)
    res.json({ ok: true, token, user: users.userPublic(user) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.post('/api/friends/request', authMiddleware, async (req, res) => {
  try {
    const { username: targetUsername } = req.body ?? {}
    if (!targetUsername || typeof targetUsername !== 'string') {
      res.status(400).json({ ok: false, error: '请填写对方用户名' })
      return
    }
    const peer = await users.getUserByUsername(targetUsername.trim())
    if (!peer) {
      res.status(404).json({ ok: false, error: '用户不存在' })
      return
    }
    if (peer.id === req.user.id) {
      res.status(400).json({ ok: false, error: '不能添加自己' })
      return
    }
    const result = await friends.createFriendRequest(req.user.id, peer.id)
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error })
      return
    }
    emitToUser(io, peer.id, 'friend_request', {
      id: result.request.id,
      from: users.userPublic(await users.getUserById(req.user.id)),
    })
    res.json({ ok: true, requestId: result.request.id })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.get('/api/friends', authMiddleware, async (req, res) => {
  try {
    const list = await friends.listFriends(req.user.id)
    res.json({ ok: true, friends: list })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.get('/api/friends/requests/incoming', authMiddleware, async (req, res) => {
  try {
    const list = await friends.listIncoming(req.user.id)
    res.json({ ok: true, requests: list })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.get('/api/friends/requests/outgoing', authMiddleware, async (req, res) => {
  try {
    const list = await friends.listOutgoing(req.user.id)
    res.json({ ok: true, requests: list })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.post('/api/friends/requests/:requestId/accept', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params
    const result = await friends.acceptRequest(requestId, req.user.id)
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error })
      return
    }
    emitToUser(io, result.fromUserId, 'friend_accepted', { user: req.user })
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.post('/api/friends/requests/:requestId/reject', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params
    const result = await friends.rejectRequest(requestId, req.user.id)
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error })
      return
    }
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.post('/api/groups', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body ?? {}
    const result = await groups.createGroup(req.user.id, typeof name === 'string' ? name : '')
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error })
      return
    }
    res.json({ ok: true, group: result.group })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.get('/api/groups', authMiddleware, async (req, res) => {
  try {
    const list = await groups.listGroupsForUser(req.user.id)
    res.json({ ok: true, groups: list })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.get('/api/groups/invites/incoming', authMiddleware, async (req, res) => {
  try {
    const list = await groups.listIncomingGroupInvites(req.user.id)
    res.json({ ok: true, invites: list })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.post('/api/groups/invites/:inviteId/accept', authMiddleware, async (req, res) => {
  try {
    const result = await groups.acceptGroupInvite(req.params.inviteId, req.user.id)
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error })
      return
    }
    const room = groups.groupRoomId(result.groupId)
    const socks = presence.get(req.user.id)
    if (socks) {
      for (const sid of socks.socketIds) {
        io.sockets.sockets.get(sid)?.join(room)
      }
    }
    emitToUser(io, req.user.id, 'group_joined', {
      groupId: result.groupId,
      roomId: room,
    })
    res.json({ ok: true, group: result.group })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.post('/api/groups/invites/:inviteId/reject', authMiddleware, async (req, res) => {
  try {
    const result = await groups.rejectGroupInvite(req.params.inviteId, req.user.id)
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error })
      return
    }
    res.json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.get('/api/groups/:groupId', authMiddleware, async (req, res) => {
  try {
    const g = await groups.getGroup(req.params.groupId)
    if (!g) {
      res.status(404).json({ ok: false, error: '群不存在' })
      return
    }
    const member = await groups.isMember(g.id, req.user.id)
    if (!member) {
      res.status(403).json({ ok: false, error: '无权查看' })
      return
    }
    res.json({ ok: true, group: g })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.get('/api/groups/:groupId/members', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params
    if (!(await groups.isMember(groupId, req.user.id))) {
      res.status(403).json({ ok: false, error: '无权查看' })
      return
    }
    const list = await groups.listMembers(groupId)
    res.json({ ok: true, members: list })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.post('/api/groups/:groupId/members', authMiddleware, async (req, res) => {
  try {
    const { groupId } = req.params
    const { username: targetUsername } = req.body ?? {}
    if (!(await groups.isOwner(groupId, req.user.id))) {
      res.status(403).json({ ok: false, error: '仅群主可拉人' })
      return
    }
    if (!targetUsername || typeof targetUsername !== 'string') {
      res.status(400).json({ ok: false, error: '请填写用户名' })
      return
    }
    const peer = await users.getUserByUsername(targetUsername.trim())
    if (!peer) {
      res.status(404).json({ ok: false, error: '用户不存在' })
      return
    }
    const okFriend = await friends.areFriends(req.user.id, peer.id)
    if (!okFriend) {
      res.status(400).json({ ok: false, error: '只能邀请好友入群' })
      return
    }
    const inv = await groups.createGroupInvite(groupId, req.user.id, peer.id)
    if (!inv.ok) {
      res.status(400).json({ ok: false, error: inv.error })
      return
    }
    const g = await groups.getGroup(groupId)
    const inviterRow = await users.getUserById(req.user.id)
    emitToUser(io, peer.id, 'group_invite', {
      inviteId: inv.invite.id,
      groupId,
      groupName: g?.name ?? '',
      inviter: inviterRow ? users.userPublic(inviterRow) : { id: req.user.id, username: '', nickname: '' },
    })
    res.json({ ok: true, inviteId: inv.invite.id })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

app.delete('/api/groups/:groupId/members/me', authMiddleware, async (req, res) => {
  try {
    const result = await groups.leaveGroup(req.params.groupId, req.user.id)
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error })
      return
    }
    res.json({ ok: true, dissolved: result.dissolved })
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '服务器错误' })
  }
})

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token
    if (!token || typeof token !== 'string') {
      next(new Error('未登录'))
      return
    }
    const payload = jwt.verify(token, JWT_SECRET)
    const uid = typeof payload.sub === 'string' ? payload.sub : null
    if (!uid) {
      next(new Error('无效令牌'))
      return
    }
    const user = await users.getUserById(uid)
    if (!user) {
      next(new Error('用户不存在'))
      return
    }
    socket.data.userId = user.id
    socket.data.nickname = user.nickname
    next()
  } catch {
    next(new Error('登录已失效'))
  }
})

io.on('connection', async (socket) => {
  const uid = socket.data.userId
  const nickname = socket.data.nickname
  if (!uid || !nickname) {
    socket.disconnect(true)
    return
  }

  let entry = presence.get(uid)
  if (!entry) {
    entry = { id: uid, nickname, socketIds: new Set() }
    presence.set(uid, entry)
  } else {
    entry.nickname = nickname
  }
  entry.socketIds.add(socket.id)
  socket.join('lobby')

  try {
    const userGroups = await groups.listGroupsForUser(uid)
    for (const g of userGroups) {
      socket.join(groups.groupRoomId(g.id))
    }
  } catch (e) {
    console.error(e)
  }

  broadcastOnline(io)

  socket.on('get_history', async ({ roomId }, ack) => {
    if (!uid || typeof roomId !== 'string') {
      ack?.({ ok: false })
      return
    }
    try {
      if (roomId === 'lobby') {
        const list = await messageStore.listMessagesForRoom(roomId, MAX_MSG_PER_ROOM)
        ack?.({ ok: true, messages: list })
        return
      }
      if (roomId.startsWith('dm:')) {
        const parts = roomId.slice(3).split(':')
        if (parts.length !== 2 || !parts.includes(uid)) {
          ack?.({ ok: false })
          return
        }
        const peer = parts[0] === uid ? parts[1] : parts[0]
        if (!(await friends.areFriends(uid, peer))) {
          ack?.({ ok: false })
          return
        }
        const list = await messageStore.listMessagesForRoom(roomId, MAX_MSG_PER_ROOM)
        ack?.({ ok: true, messages: list })
        return
      }
      if (roomId.startsWith('group:')) {
        const gid = groups.parseGroupRoomId(roomId)
        if (!gid || !(await groups.isMember(gid, uid))) {
          ack?.({ ok: false })
          return
        }
        const list = await messageStore.listMessagesForRoom(roomId, MAX_MSG_PER_ROOM)
        ack?.({ ok: true, messages: list })
        return
      }
      ack?.({ ok: false })
    } catch {
      ack?.({ ok: false })
    }
  })

  socket.on('join_room', async ({ roomId }) => {
    if (!uid || typeof roomId !== 'string') return
    try {
      if (roomId === 'lobby') {
        socket.join('lobby')
        return
      }
      if (roomId.startsWith('dm:')) {
        const parts = roomId.slice(3).split(':')
        if (parts.length === 2 && parts.includes(uid)) {
          const peer = parts[0] === uid ? parts[1] : parts[0]
          if (await friends.areFriends(uid, peer)) socket.join(roomId)
        }
        return
      }
      if (roomId.startsWith('group:')) {
        const gid = groups.parseGroupRoomId(roomId)
        if (gid && (await groups.isMember(gid, uid))) socket.join(roomId)
      }
    } catch (e) {
      console.error(e)
    }
  })

  socket.on('send_message', async ({ roomId, body }) => {
    if (!uid || !nickname) return
    const text = typeof body === 'string' ? body.trim() : ''
    if (!text || text.length > 2000) return

    try {
      if (roomId === 'lobby') {
        const draft = {
          id: randomUUID(),
          roomId,
          userId: uid,
          nickname,
          body: text,
        }
        const msg = await messageStore.insertMessage(draft)
        io.to('lobby').emit('message', msg)
        return
      }

      if (typeof roomId === 'string' && roomId.startsWith('dm:')) {
        const parts = roomId.slice(3).split(':')
        if (parts.length !== 2 || !parts.includes(uid)) return
        const peer = parts[0] === uid ? parts[1] : parts[0]
        if (!(await friends.areFriends(uid, peer))) return
        const draft = {
          id: randomUUID(),
          roomId,
          userId: uid,
          nickname,
          body: text,
        }
        const msg = await messageStore.insertMessage(draft)
        emitToUser(io, peer, 'message', msg)
        emitToUser(io, uid, 'message', msg)
        return
      }

      if (typeof roomId === 'string' && roomId.startsWith('group:')) {
        const gid = groups.parseGroupRoomId(roomId)
        if (!gid || !(await groups.isMember(gid, uid))) return
        const draft = {
          id: randomUUID(),
          roomId,
          userId: uid,
          nickname,
          body: text,
        }
        const msg = await messageStore.insertMessage(draft)
        io.to(roomId).emit('message', msg)
      }
    } catch (e) {
      console.error(e)
    }
  })

  socket.on('open_dm', async ({ peerId }) => {
    if (!uid || typeof peerId !== 'string' || peerId === uid) return
    try {
      if (!(await friends.areFriends(uid, peerId))) return
      const roomId = dmRoomId(uid, peerId)
      socket.join(roomId)
      const peerSockets = presence.get(peerId)
      if (peerSockets) {
        for (const sid of peerSockets.socketIds) {
          io.sockets.sockets.get(sid)?.join(roomId)
        }
      }
      const peerUser = await users.getUserById(peerId)
      socket.emit('dm_ready', {
        roomId,
        peer: { id: peerId, nickname: peerUser?.nickname ?? '用户' },
      })
    } catch (e) {
      console.error(e)
    }
  })

  socket.on('disconnect', () => {
    const p = presence.get(uid)
    if (p) {
      p.socketIds.delete(socket.id)
      if (p.socketIds.size === 0) presence.delete(uid)
    }
    broadcastOnline(io)
  })
})

httpServer.listen(PORT, () => {
  console.log(`Ribbit IM server http://localhost:${PORT}`)
})
