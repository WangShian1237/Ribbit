-- 入群邀请：被邀请人同意后才会写入 group_members

CREATE TABLE IF NOT EXISTS group_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT group_invites_no_self CHECK (inviter_id <> to_user_id),
  UNIQUE (group_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_invites_to ON group_invites (to_user_id);
