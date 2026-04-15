export type ChatMessage = {
  id: string
  roomId: string
  userId: string
  nickname: string
  body: string
  ts: number
}

export type OnlineUser = { id: string; nickname: string }

export type Conversation = {
  roomId: string
  title: string
  kind: 'lobby' | 'dm' | 'group'
  peerId?: string
  groupId?: string
}

export type AuthUser = {
  id: string
  username: string
  nickname: string
}

export type Friend = {
  id: string
  username: string
  nickname: string
}

export type IncomingRequest = {
  id: string
  from_user_id: string
  created_at: string
  username: string
  nickname: string
}

export type GroupRow = {
  id: string
  name: string
  owner_id: string
  created_at: string
}

/** 待处理的入群邀请（GET /api/groups/invites/incoming） */
export type GroupInviteIn = {
  id: string
  group_id: string
  created_at: string
  group_name: string
  inviter_username: string
  inviter_nickname: string
}
