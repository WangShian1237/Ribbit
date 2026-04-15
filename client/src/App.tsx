import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type {
  AuthUser,
  ChatMessage,
  Conversation,
  Friend,
  GroupInviteIn,
  GroupRow,
  IncomingRequest,
  OnlineUser,
} from './types'

const TOKEN_KEY = 'ribbit_token'

function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue} 42% 46%)`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    month: 'numeric',
    day: 'numeric',
  })
}

function peerFromDm(roomId: string, selfId: string): string | null {
  if (!roomId.startsWith('dm:')) return null
  const parts = roomId.slice(3).split(':')
  if (parts.length !== 2) return null
  const [a, b] = parts
  if (a === selfId) return b
  if (b === selfId) return a
  return null
}

function mergeConvos(groups: GroupRow[], prev: Conversation[]): Conversation[] {
  const dms = prev.filter((c) => c.kind === 'dm')
  const gs: Conversation[] = groups.map((g) => ({
    roomId: `group:${g.id}`,
    title: g.name,
    kind: 'group',
    groupId: g.id,
  }))
  return [{ roomId: 'lobby', title: 'Ribbit 大厅', kind: 'lobby' }, ...gs, ...dms]
}

async function apiJson<T>(
  path: string,
  init?: RequestInit & { json?: unknown; withAuth?: boolean },
): Promise<T> {
  const { json, headers: h, withAuth = true, ...rest } = init ?? {}
  const headers = new Headers(h)
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  if (withAuth) {
    const token = sessionStorage.getItem(TOKEN_KEY)
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }
  const res = await fetch(path, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as T & { ok?: boolean; error?: string }
    } catch {
      throw new Error(
        '服务器返回了非 JSON 数据。请确认后端已启动，并用 http://localhost:5173 访问。',
      )
    }
  }
  const obj = (data ?? {}) as T & { ok?: boolean; error?: string }
  if (!res.ok) {
    const err =
      typeof obj.error === 'string' ? obj.error : `请求失败 (${res.status})`
    throw new Error(err)
  }
  return obj as T
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [regNickname, setRegNickname] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [user, setUser] = useState<AuthUser | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connecting, setConnecting] = useState(false)

  const [online, setOnline] = useState<OnlineUser[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [incoming, setIncoming] = useState<IncomingRequest[]>([])
  const [groupInvites, setGroupInvites] = useState<GroupInviteIn[]>([])
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([
    { roomId: 'lobby', title: 'Ribbit 大厅', kind: 'lobby' },
  ])
  const [activeRoomId, setActiveRoomId] = useState('lobby')
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({})
  const [draft, setDraft] = useState('')
  const [sidebarQuery, setSidebarQuery] = useState('')
  const onlineRef = useRef<OnlineUser[]>([])
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [addFriendUsername, setAddFriendUsername] = useState('')
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [inviteUsername, setInviteUsername] = useState('')

  const listRef = useRef<HTMLDivElement>(null)

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends])

  useEffect(() => {
    onlineRef.current = online
  }, [online])

  const loadSocial = useCallback(async () => {
    try {
      const [f, inc, g, ginv] = await Promise.all([
        apiJson<{ friends: Friend[] }>('/api/friends'),
        apiJson<{ requests: IncomingRequest[] }>('/api/friends/requests/incoming'),
        apiJson<{ groups: GroupRow[] }>('/api/groups'),
        apiJson<{ invites: GroupInviteIn[] }>('/api/groups/invites/incoming'),
      ])
      setFriends(f.friends)
      setIncoming(inc.requests)
      setGroups(g.groups)
      setGroupInvites(ginv.invites)
      setConversations((prev) => mergeConvos(g.groups, prev))
    } catch {
      /* ignore */
    }
  }, [])

  const connectSocket = useCallback((token: string) => {
    const s = io({
      path: '/socket.io/',
      auth: { token },
      transports: ['websocket', 'polling'],
    })
    s.on('connect_error', (err) => {
      window.alert(err.message || '连接失败')
      s.disconnect()
      setSocket(null)
      setUser(null)
      sessionStorage.removeItem(TOKEN_KEY)
    })
    setSocket(s)
  }, [])

  useEffect(() => {
    const t = sessionStorage.getItem(TOKEN_KEY)
    if (!t) {
      setBooting(false)
      return
    }
    ;(async () => {
      try {
        const j = await apiJson<{ ok: boolean; user?: AuthUser }>('/api/me')
        if (j.ok && j.user) {
          setUser(j.user)
          connectSocket(t)
        } else {
          sessionStorage.removeItem(TOKEN_KEY)
        }
      } catch {
        sessionStorage.removeItem(TOKEN_KEY)
      } finally {
        setBooting(false)
      }
    })()
  }, [connectSocket])

  useEffect(() => {
    if (!user) return
    void loadSocial()
  }, [user, loadSocial])

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const mergeConversation = useCallback((c: Conversation) => {
    setConversations((prev) => {
      if (prev.some((x) => x.roomId === c.roomId)) return prev
      return [c, ...prev]
    })
  }, [])

  const ensureDmConversation = useCallback(
    (roomId: string, peerId: string, title: string) => {
      mergeConversation({ roomId, title, kind: 'dm', peerId })
    },
    [mergeConversation],
  )

  const submitLogin = async () => {
    const u = username.trim()
    const p = password
    if (!u || !p) {
      window.alert('请输入用户名和密码')
      return
    }
    setConnecting(true)
    try {
      const j = await apiJson<{ ok: boolean; token?: string; user?: AuthUser }>('/api/login', {
        method: 'POST',
        json: { username: u, password: p },
        withAuth: false,
      })
      if (j.token && j.user) {
        sessionStorage.setItem(TOKEN_KEY, j.token)
        setUser(j.user)
        connectSocket(j.token)
      } else {
        throw new Error('登录响应缺少 token')
      }
    } catch (e) {
      const msg =
        e instanceof TypeError
          ? '无法连接服务器。请确认已启动 PostgreSQL、执行迁移，并在根目录运行 npm run dev。'
          : e instanceof Error
            ? e.message
            : '登录失败'
      window.alert(msg)
    } finally {
      setConnecting(false)
    }
  }

  const submitRegister = async () => {
    const u = username.trim()
    const p = password
    const nick = regNickname.trim() || u
    if (p !== confirmPassword) {
      window.alert('两次输入的密码不一致')
      return
    }
    setConnecting(true)
    try {
      const j = await apiJson<{ ok: boolean; token?: string; user?: AuthUser }>('/api/register', {
        method: 'POST',
        json: { username: u, password: p, nickname: nick },
        withAuth: false,
      })
      if (j.token && j.user) {
        sessionStorage.setItem(TOKEN_KEY, j.token)
        setUser(j.user)
        connectSocket(j.token)
      } else {
        throw new Error('注册响应缺少 token')
      }
    } catch (e) {
      const msg =
        e instanceof TypeError
          ? '无法连接服务器。请确认已启动 PostgreSQL、执行迁移，并在根目录运行 npm run dev。'
          : e instanceof Error
            ? e.message
            : '注册失败'
      window.alert(msg)
    } finally {
      setConnecting(false)
    }
  }

  useEffect(() => {
    if (!socket || !user) return

    const onOnline = (list: OnlineUser[]) => setOnline(list)
    const onMessage = (msg: ChatMessage) => {
      setMessages((prev) => ({
        ...prev,
        [msg.roomId]: [...(prev[msg.roomId] ?? []), msg],
      }))
      if (msg.roomId.startsWith('dm:')) {
        const peer = peerFromDm(msg.roomId, user.id)
        if (peer) {
          const title =
            msg.userId === user.id
              ? onlineRef.current.find((x) => x.id === peer)?.nickname ?? '私聊'
              : msg.nickname
          ensureDmConversation(msg.roomId, peer, title)
        }
      }
      if (msg.roomId.startsWith('group:')) {
        const gid = msg.roomId.slice(7)
        const g = groups.find((x) => x.id === gid)
        const title = g?.name ?? '群聊'
        mergeConversation({
          roomId: msg.roomId,
          title,
          kind: 'group',
          groupId: gid,
        })
      }
    }

    const onDmReady = (payload: {
      roomId: string
      peer: { id: string; nickname: string }
    }) => {
      ensureDmConversation(payload.roomId, payload.peer.id, payload.peer.nickname)
      setActiveRoomId(payload.roomId)
      socket.emit('join_room', { roomId: payload.roomId })
      socket.emit(
        'get_history',
        { roomId: payload.roomId },
        (ack: { ok?: boolean; messages?: ChatMessage[] }) => {
          if (ack?.ok && ack.messages)
            setMessages((prev) => ({ ...prev, [payload.roomId]: ack.messages ?? [] }))
        },
      )
    }

    const onFriendPing = () => {
      void loadSocial()
    }

    socket.on('online_users', onOnline)
    socket.on('message', onMessage)
    socket.on('dm_ready', onDmReady)
    socket.on('friend_request', onFriendPing)
    socket.on('friend_accepted', onFriendPing)
    socket.on('group_joined', onFriendPing)
    socket.on('group_invite', onFriendPing)

    socket.emit('join_room', { roomId: 'lobby' })
    socket.emit('get_history', { roomId: 'lobby' }, (ack: { ok?: boolean; messages?: ChatMessage[] }) => {
      if (ack?.ok && ack.messages)
        setMessages((prev) => ({ ...prev, lobby: ack.messages ?? [] }))
    })

    return () => {
      socket.off('online_users', onOnline)
      socket.off('message', onMessage)
      socket.off('dm_ready', onDmReady)
      socket.off('friend_request', onFriendPing)
      socket.off('friend_accepted', onFriendPing)
      socket.off('group_joined', onFriendPing)
      socket.off('group_invite', onFriendPing)
    }
  }, [socket, user, ensureDmConversation, mergeConversation, groups, loadSocial])

  useEffect(() => {
    scrollToBottom()
  }, [messages, activeRoomId, scrollToBottom])

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY)
    socket?.disconnect()
    setSocket(null)
    setUser(null)
    setMessages({})
    setOnline([])
    setFriends([])
    setIncoming([])
    setGroups([])
    setConversations([{ roomId: 'lobby', title: 'Ribbit 大厅', kind: 'lobby' }])
    setActiveRoomId('lobby')
    setPassword('')
    setConfirmPassword('')
  }

  const activeConv = useMemo(
    () => conversations.find((c) => c.roomId === activeRoomId),
    [conversations, activeRoomId],
  )

  const filteredSidebar = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter((c) => c.title.toLowerCase().includes(q))
  }, [conversations, sidebarQuery])

  const openFriendDm = (f: Friend) => {
    if (!socket || !user) return
    socket.emit('open_dm', { peerId: f.id })
  }

  const openPeerDm = (peer: OnlineUser) => {
    if (!user || peer.id === user.id || !socket) return
    if (!friendIds.has(peer.id)) {
      window.alert('请先添加对方为好友后再私聊')
      return
    }
    socket.emit('open_dm', { peerId: peer.id })
  }

  const sendAddFriendRequest = async () => {
    const u = addFriendUsername.trim()
    if (!u) return
    try {
      await apiJson('/api/friends/request', { method: 'POST', json: { username: u } })
      window.alert('好友请求已发送')
      setShowAddFriend(false)
      setAddFriendUsername('')
      void loadSocial()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '发送失败')
    }
  }

  const acceptReq = async (id: string) => {
    try {
      await apiJson(`/api/friends/requests/${id}/accept`, { method: 'POST', json: {} })
      void loadSocial()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '操作失败')
    }
  }

  const rejectReq = async (id: string) => {
    try {
      await apiJson(`/api/friends/requests/${id}/reject`, { method: 'POST', json: {} })
      void loadSocial()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '操作失败')
    }
  }

  const acceptGroupInvite = async (inviteId: string) => {
    try {
      const j = await apiJson<{ group?: GroupRow }>(`/api/groups/invites/${inviteId}/accept`, {
        method: 'POST',
        json: {},
      })
      await loadSocial()
      if (j.group?.id) {
        const roomId = `group:${j.group.id}`
        setActiveRoomId(roomId)
        socket?.emit('join_room', { roomId })
        socket?.emit('get_history', { roomId }, (ack: { ok?: boolean; messages?: ChatMessage[] }) => {
          if (ack?.ok && ack.messages) setMessages((prev) => ({ ...prev, [roomId]: ack.messages ?? [] }))
        })
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '操作失败')
    }
  }

  const rejectGroupInvite = async (inviteId: string) => {
    try {
      await apiJson(`/api/groups/invites/${inviteId}/reject`, { method: 'POST', json: {} })
      void loadSocial()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '操作失败')
    }
  }

  const createGroup = async () => {
    const name = newGroupName.trim()
    if (!name) return
    try {
      const j = await apiJson<{ group: GroupRow }>('/api/groups', {
        method: 'POST',
        json: { name },
      })
      setShowCreateGroup(false)
      setNewGroupName('')
      await loadSocial()
      const roomId = `group:${j.group.id}`
      setActiveRoomId(roomId)
      socket?.emit('join_room', { roomId })
      socket?.emit('get_history', { roomId }, (ack: { ok?: boolean; messages?: ChatMessage[] }) => {
        if (ack?.ok && ack.messages) setMessages((prev) => ({ ...prev, [roomId]: ack.messages ?? [] }))
      })
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '创建失败')
    }
  }

  const inviteToGroup = async () => {
    const g = activeConv?.groupId
    const u = inviteUsername.trim()
    if (!g || !u || !socket) return
    try {
      await apiJson(`/api/groups/${g}/members`, { method: 'POST', json: { username: u } })
      setInviteUsername('')
      window.alert('入群邀请已发送，对方同意后才会加入群聊')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '失败')
    }
  }

  const leaveGroup = async () => {
    const g = activeConv?.groupId
    if (!g) return
    try {
      const j = await apiJson<{ dissolved?: boolean }>(`/api/groups/${g}/members/me`, {
        method: 'DELETE',
      })
      if (j.dissolved) window.alert('群已解散')
      await loadSocial()
      setActiveRoomId('lobby')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '失败')
    }
  }

  const send = () => {
    const text = draft.trim()
    if (!text || !socket || !user) return
    socket.emit('send_message', { roomId: activeRoomId, body: text })
    setDraft('')
  }

  const currentMessages = messages[activeRoomId] ?? []

  const showSenderName =
    activeRoomId === 'lobby' || activeRoomId.startsWith('group:')

  if (booting) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#dcdcdc] text-sm text-neutral-600">
        正在恢复登录…
      </div>
    )
  }

  if (!user || !socket) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-[#dcdcdc] px-4 py-10">
        <div className="w-full max-w-[380px] rounded-lg bg-white p-8 shadow-md">
          <h1 className="mb-1 text-center text-xl font-medium text-neutral-800">Ribbit</h1>
          <p className="mb-6 text-center text-sm text-neutral-500">注册账号后登录（需 PostgreSQL）</p>
          <div className="mb-4 flex rounded bg-[#ededed] p-0.5 text-sm">
            <button
              type="button"
              className={`flex-1 rounded py-1.5 ${authMode === 'login' ? 'bg-white shadow-sm' : 'text-neutral-600'}`}
              onClick={() => setAuthMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              className={`flex-1 rounded py-1.5 ${authMode === 'register' ? 'bg-white shadow-sm' : 'text-neutral-600'}`}
              onClick={() => setAuthMode('register')}
            >
              注册
            </button>
          </div>
          <label className="mb-2 block text-sm text-neutral-600">用户名</label>
          <input
            className="mb-3 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[#07c160]"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="3–20 位"
            autoComplete="username"
            onKeyDown={(e) => {
              if (e.key === 'Enter') authMode === 'login' ? submitLogin() : submitRegister()
            }}
          />
          <label className="mb-2 block text-sm text-neutral-600">密码</label>
          <input
            type="password"
            className="mb-3 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[#07c160]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位"
            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') authMode === 'login' ? submitLogin() : submitRegister()
            }}
          />
          {authMode === 'register' && (
            <>
              <label className="mb-2 block text-sm text-neutral-600">确认密码</label>
              <input
                type="password"
                className="mb-3 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[#07c160]"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              <label className="mb-2 block text-sm text-neutral-600">昵称（可选）</label>
              <input
                className="mb-4 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[#07c160]"
                value={regNickname}
                onChange={(e) => setRegNickname(e.target.value)}
                maxLength={32}
              />
            </>
          )}
          <button
            type="button"
            className="w-full rounded bg-[#07c160] py-2.5 text-sm font-medium text-white hover:bg-[#06ae56] disabled:opacity-60"
            onClick={authMode === 'login' ? submitLogin : submitRegister}
            disabled={connecting}
          >
            {connecting ? '处理中…' : authMode === 'login' ? '登录' : '注册并登录'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[480px] bg-[#f5f5f5]">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-black/6 bg-[#ededed]">
        <header className="flex items-center gap-2 px-3 py-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-sm font-medium text-white"
            style={{ backgroundColor: avatarColor(user.nickname) }}
          >
            {user.nickname.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-medium text-neutral-800">{user.nickname}</div>
            <div className="truncate text-[11px] text-neutral-500">{user.username}</div>
            <button type="button" className="text-xs text-[#576b95] hover:underline" onClick={logout}>
              退出
            </button>
          </div>
        </header>
        <div className="px-2 pb-2">
          <input
            className="w-full rounded bg-[#dbdbdb] px-2 py-1.5 text-[13px] text-neutral-700 placeholder:text-neutral-500"
            placeholder="搜索会话"
            value={sidebarQuery}
            onChange={(e) => setSidebarQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-1 border-t border-black/6 px-2 py-1">
          <button
            type="button"
            className="rounded bg-[#07c160] px-2 py-1 text-[12px] text-white"
            onClick={() => setShowAddFriend(true)}
          >
            添加好友
          </button>
          <button
            type="button"
            className="rounded bg-[#576b95] px-2 py-1 text-[12px] text-white"
            onClick={() => setShowCreateGroup(true)}
          >
            新建群
          </button>
        </div>

        <div className="border-t border-black/6 px-2 py-1 text-[11px] text-neutral-500">
          新的朋友 {incoming.length > 0 ? `(${incoming.length})` : ''}
        </div>
        <ul className="max-h-[120px] shrink-0 overflow-y-auto border-b border-black/6 px-1">
          {incoming.length === 0 ? (
            <li className="px-2 py-1 text-[12px] text-neutral-400">暂无</li>
          ) : (
            incoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-1 px-2 py-1 text-[12px]">
                <span className="truncate">
                  {r.nickname} ({r.username})
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    className="text-[#576b95]"
                    onClick={() => acceptReq(r.id)}
                  >
                    同意
                  </button>
                  <button type="button" className="text-neutral-500" onClick={() => rejectReq(r.id)}>
                    拒绝
                  </button>
                </span>
              </li>
            ))
          )}
        </ul>

        <div className="border-t border-black/6 px-2 py-1 text-[11px] text-neutral-500">
          群邀请 {groupInvites.length > 0 ? `(${groupInvites.length})` : ''}
        </div>
        <ul className="max-h-[120px] shrink-0 overflow-y-auto border-b border-black/6 px-1">
          {groupInvites.length === 0 ? (
            <li className="px-2 py-1 text-[12px] text-neutral-400">暂无</li>
          ) : (
            groupInvites.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-1 px-2 py-1.5 text-[12px]">
                <div className="truncate text-neutral-800">
                  「{inv.group_name}」
                  <span className="text-neutral-500">
                    — {inv.inviter_nickname}（{inv.inviter_username}）
                  </span>
                </div>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="text-[#576b95]"
                    onClick={() => acceptGroupInvite(inv.id)}
                  >
                    同意入群
                  </button>
                  <button
                    type="button"
                    className="text-neutral-500"
                    onClick={() => rejectGroupInvite(inv.id)}
                  >
                    拒绝
                  </button>
                </span>
              </li>
            ))
          )}
        </ul>

        <div className="px-2 py-1 text-[11px] text-neutral-500">好友</div>
        <ul className="max-h-[100px] shrink-0 overflow-y-auto border-b border-black/6">
          {friends.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#e0e0e0]"
                onClick={() => openFriendDm(f)}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-medium text-white"
                  style={{ backgroundColor: avatarColor(f.nickname) }}
                >
                  {f.nickname.slice(0, 1).toUpperCase()}
                </div>
                <span className="truncate text-[13px] text-neutral-800">{f.nickname}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="border-t border-black/6 px-2 py-1 text-[11px] text-neutral-500">会话</div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {filteredSidebar.map((c) => (
            <li key={c.roomId}>
              <button
                type="button"
                onClick={() => {
                  setActiveRoomId(c.roomId)
                  if (!messages[c.roomId]?.length && socket) {
                    socket.emit('join_room', { roomId: c.roomId })
                    socket.emit(
                      'get_history',
                      { roomId: c.roomId },
                      (ack: { ok?: boolean; messages?: ChatMessage[] }) => {
                        if (ack?.ok && ack.messages)
                          setMessages((prev) => ({ ...prev, [c.roomId]: ack.messages ?? [] }))
                      },
                    )
                  }
                }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${
                  activeRoomId === c.roomId ? 'bg-[#c9c9c9]' : 'hover:bg-[#e0e0e0]'
                }`}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-sm font-medium text-white"
                  style={{ backgroundColor: avatarColor(c.title) }}
                >
                  {c.title.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] text-neutral-800">{c.title}</div>
                  <div className="truncate text-[12px] text-neutral-500">
                    {(messages[c.roomId] ?? []).slice(-1)[0]?.body ??
                      (c.kind === 'lobby' ? '公共频道' : c.kind === 'group' ? '群聊' : '')}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>

        <div className="border-t border-black/6 px-2 py-1 text-[11px] text-neutral-500">在线</div>
        <ul className="max-h-[28%] shrink-0 overflow-y-auto border-t border-black/6">
          {online
            .filter((u) => u.id !== user.id)
            .map((u) => (
              <li key={u.id} className="flex items-center gap-1 px-2 py-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left hover:bg-[#e0e0e0]"
                  onClick={() => openPeerDm(u)}
                  disabled={!friendIds.has(u.id)}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-xs font-medium text-white"
                    style={{ backgroundColor: avatarColor(u.nickname) }}
                  >
                    {u.nickname.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="truncate text-[13px] text-neutral-800">{u.nickname}</span>
                </button>
                {!friendIds.has(u.id) && (
                  <button
                    type="button"
                    className="shrink-0 text-[11px] text-[#576b95]"
                    onClick={() => {
                      setAddFriendUsername('')
                      setShowAddFriend(true)
                    }}
                  >
                    加好友
                  </button>
                )}
              </li>
            ))}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-[#ededed]">
        <header className="flex shrink-0 flex-col border-b border-black/6 bg-[#f5f5f5] px-4 py-2">
          <h2 className="truncate text-[17px] font-medium text-neutral-900">
            {activeConv?.title ?? '聊天'}
          </h2>
          {activeConv?.kind === 'group' && activeConv.groupId && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                className="max-w-[140px] rounded border border-neutral-300 px-2 py-1 text-[12px]"
                placeholder="好友用户名"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
              />
              <button
                type="button"
                className="rounded bg-[#07c160] px-2 py-1 text-[12px] text-white"
                onClick={inviteToGroup}
              >
                拉好友入群
              </button>
              <button
                type="button"
                className="rounded border border-neutral-400 px-2 py-1 text-[12px]"
                onClick={leaveGroup}
              >
                退群/解散
              </button>
            </div>
          )}
        </header>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {currentMessages.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-400">暂无消息</p>
          ) : (
            <ul className="space-y-3">
              {currentMessages.map((m, i) => {
                const mine = m.userId === user.id
                const showTime =
                  i === 0 || m.ts - (currentMessages[i - 1]?.ts ?? 0) > 5 * 60 * 1000
                return (
                  <li key={m.id}>
                    {showTime && (
                      <div className="mb-2 text-center text-[11px] text-neutral-400">
                        {formatTime(m.ts)}
                      </div>
                    )}
                    <div className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                      <div
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded text-xs font-medium text-white"
                        style={{ backgroundColor: avatarColor(m.nickname) }}
                      >
                        {m.nickname.slice(0, 1).toUpperCase()}
                      </div>
                      <div
                        className={`max-w-[72%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}
                      >
                        {!mine && showSenderName && (
                          <span className="text-[11px] text-neutral-500">{m.nickname}</span>
                        )}
                        <div
                          className={`rounded px-2.5 py-2 text-[15px] leading-snug ${
                            mine
                              ? 'bg-[#95ec69] text-neutral-900'
                              : 'bg-white text-neutral-900 shadow-sm'
                          }`}
                        >
                          {m.body}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="shrink-0 border-t border-black/6 bg-[#f5f5f5] p-2">
          <div className="flex items-end gap-2 rounded bg-white px-2 py-2 shadow-sm">
            <textarea
              className="max-h-32 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400"
              placeholder="输入消息，Enter 发送"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
            />
            <button
              type="button"
              className="mb-0.5 shrink-0 rounded bg-[#07c160] px-4 py-1.5 text-sm text-white hover:bg-[#06ae56]"
              onClick={send}
            >
              发送
            </button>
          </div>
        </footer>
      </section>

      {showAddFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
            <h3 className="mb-2 text-sm font-medium">添加好友</h3>
            <input
              className="mb-3 w-full rounded border px-2 py-2 text-sm"
              placeholder="对方用户名"
              value={addFriendUsername}
              onChange={(e) => setAddFriendUsername(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-neutral-600" onClick={() => setShowAddFriend(false)}>
                取消
              </button>
              <button
                type="button"
                className="rounded bg-[#07c160] px-3 py-1 text-sm text-white"
                onClick={sendAddFriendRequest}
              >
                发送请求
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
            <h3 className="mb-2 text-sm font-medium">新建群</h3>
            <input
              className="mb-3 w-full rounded border px-2 py-2 text-sm"
              placeholder="群名称"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-sm text-neutral-600"
                onClick={() => setShowCreateGroup(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded bg-[#07c160] px-3 py-1 text-sm text-white"
                onClick={createGroup}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
