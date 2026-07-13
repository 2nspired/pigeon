-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "slug" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "repo_path" TEXT,
    "default_board_id" TEXT,
    "next_card_number" INTEGER NOT NULL DEFAULT 1,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "project_default_board_id_fkey" FOREIGN KEY ("default_board_id") REFERENCES "board" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "milestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "target_date" DATETIME,
    "position" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'active',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "milestone_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'active',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tag_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "board" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stale_in_progress_days" INTEGER DEFAULT 3,
    "accent_color" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "board_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "column" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "board_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "role" TEXT,
    "is_parking" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "column_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "column_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NONE',
    "created_by" TEXT NOT NULL DEFAULT 'HUMAN',
    "milestone_id" TEXT,
    "due_date" DATETIME,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "last_edited_by" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "completed_at" DATETIME,
    CONSTRAINT "card_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "column" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "card_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "card_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "checklist_item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "checklist_item_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author_type" TEXT NOT NULL DEFAULT 'HUMAN',
    "author_name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "comment_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "card_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "intent" TEXT,
    "actor_type" TEXT NOT NULL DEFAULT 'HUMAN',
    "actor_name" TEXT,
    "session_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "card_tag" (
    "card_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    PRIMARY KEY ("card_id", "tag_id"),
    CONSTRAINT "card_tag_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "card_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'general',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "author" TEXT NOT NULL DEFAULT 'HUMAN',
    "card_id" TEXT,
    "board_id" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "note_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "note_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "note_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "handoff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "board_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "working_on" TEXT NOT NULL DEFAULT '[]',
    "findings" TEXT NOT NULL DEFAULT '[]',
    "next_steps" TEXT NOT NULL DEFAULT '[]',
    "blockers" TEXT NOT NULL DEFAULT '[]',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "handoff_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "handoff_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "card_relation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "from_card_id" TEXT NOT NULL,
    "to_card_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "card_relation_from_card_id_fkey" FOREIGN KEY ("from_card_id") REFERENCES "card" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "card_relation_to_card_id_fkey" FOREIGN KEY ("to_card_id") REFERENCES "card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "git_link" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "commit_hash" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "commit_date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_paths" TEXT NOT NULL DEFAULT '[]',
    "session_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "git_link_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "git_link_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "claim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "evidence" TEXT NOT NULL DEFAULT '{}',
    "payload" TEXT NOT NULL DEFAULT '{}',
    "author" TEXT NOT NULL DEFAULT 'AGENT',
    "card_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "supersedes_id" TEXT,
    "superseded_by_id" TEXT,
    "recorded_at_sha" TEXT,
    "verified_at" DATETIME,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "claim_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "claim_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tool_call_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tool_name" TEXT NOT NULL,
    "tool_type" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "project_id" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "response_tokens" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "token_pricing" TEXT NOT NULL DEFAULT '{}',
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "token_usage_event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "card_id" TEXT,
    "agent_name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_creation_1h_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_creation_5m_tokens" INTEGER NOT NULL DEFAULT 0,
    "recorded_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signal" TEXT,
    "signal_confidence" TEXT,
    CONSTRAINT "token_usage_event_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "token_usage_event_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "baseline_snapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "project_id" TEXT NOT NULL,
    "brief_me_tokens" INTEGER NOT NULL,
    "naive_bootstrap_tokens" INTEGER NOT NULL,
    "latest_handoff_tokens" INTEGER,
    "measured_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "baseline_snapshot_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "edition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "board_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "masthead" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "period_start" DATETIME NOT NULL,
    "period_end" DATETIME NOT NULL,
    "generated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "edition_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "board" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "edition_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "project_slug_key" ON "project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "project_repo_path_key" ON "project"("repo_path");

-- CreateIndex
CREATE UNIQUE INDEX "project_default_board_id_key" ON "project"("default_board_id");

-- CreateIndex
CREATE INDEX "milestone_project_id_idx" ON "milestone"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "milestone_project_id_name_key" ON "milestone"("project_id", "name");

-- CreateIndex
CREATE INDEX "tag_project_id_idx" ON "tag"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_project_id_slug_key" ON "tag"("project_id", "slug");

-- CreateIndex
CREATE INDEX "board_project_id_idx" ON "board"("project_id");

-- CreateIndex
CREATE INDEX "column_board_id_idx" ON "column"("board_id");

-- CreateIndex
CREATE INDEX "card_column_id_idx" ON "card"("column_id");

-- CreateIndex
CREATE INDEX "card_project_id_idx" ON "card"("project_id");

-- CreateIndex
CREATE INDEX "card_milestone_id_idx" ON "card"("milestone_id");

-- CreateIndex
CREATE INDEX "card_priority_idx" ON "card"("priority");

-- CreateIndex
CREATE INDEX "card_updated_at_idx" ON "card"("updated_at");

-- CreateIndex
CREATE INDEX "card_completed_at_idx" ON "card"("completed_at");

-- CreateIndex
CREATE INDEX "card_created_by_project_id_idx" ON "card"("created_by", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_project_id_number_key" ON "card"("project_id", "number");

-- CreateIndex
CREATE INDEX "checklist_item_card_id_idx" ON "checklist_item"("card_id");

-- CreateIndex
CREATE INDEX "comment_card_id_idx" ON "comment"("card_id");

-- CreateIndex
CREATE INDEX "activity_card_id_idx" ON "activity"("card_id");

-- CreateIndex
CREATE INDEX "activity_card_id_created_at_idx" ON "activity"("card_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_session_id_created_at_idx" ON "activity"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "card_tag_tag_id_idx" ON "card_tag"("tag_id");

-- CreateIndex
CREATE INDEX "note_project_id_idx" ON "note"("project_id");

-- CreateIndex
CREATE INDEX "note_project_id_kind_idx" ON "note"("project_id", "kind");

-- CreateIndex
CREATE INDEX "note_board_id_kind_idx" ON "note"("board_id", "kind");

-- CreateIndex
CREATE INDEX "note_card_id_idx" ON "note"("card_id");

-- CreateIndex
CREATE INDEX "note_kind_idx" ON "note"("kind");

-- CreateIndex
CREATE INDEX "note_expires_at_idx" ON "note"("expires_at");

-- CreateIndex
CREATE INDEX "note_updated_at_idx" ON "note"("updated_at");

-- CreateIndex
CREATE INDEX "handoff_board_id_created_at_idx" ON "handoff"("board_id", "created_at");

-- CreateIndex
CREATE INDEX "handoff_project_id_created_at_idx" ON "handoff"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "card_relation_from_card_id_idx" ON "card_relation"("from_card_id");

-- CreateIndex
CREATE INDEX "card_relation_to_card_id_idx" ON "card_relation"("to_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_relation_from_card_id_to_card_id_type_key" ON "card_relation"("from_card_id", "to_card_id", "type");

-- CreateIndex
CREATE INDEX "git_link_project_id_idx" ON "git_link"("project_id");

-- CreateIndex
CREATE INDEX "git_link_card_id_idx" ON "git_link"("card_id");

-- CreateIndex
CREATE INDEX "git_link_session_id_commit_date_idx" ON "git_link"("session_id", "commit_date");

-- CreateIndex
CREATE UNIQUE INDEX "git_link_project_id_commit_hash_card_id_key" ON "git_link"("project_id", "commit_hash", "card_id");

-- CreateIndex
CREATE INDEX "claim_project_id_idx" ON "claim"("project_id");

-- CreateIndex
CREATE INDEX "claim_project_id_kind_idx" ON "claim"("project_id", "kind");

-- CreateIndex
CREATE INDEX "claim_project_id_status_idx" ON "claim"("project_id", "status");

-- CreateIndex
CREATE INDEX "claim_card_id_idx" ON "claim"("card_id");

-- CreateIndex
CREATE INDEX "claim_kind_status_idx" ON "claim"("kind", "status");

-- CreateIndex
CREATE INDEX "claim_updated_at_idx" ON "claim"("updated_at");

-- CreateIndex
CREATE INDEX "tool_call_log_agent_name_idx" ON "tool_call_log"("agent_name");

-- CreateIndex
CREATE INDEX "tool_call_log_session_id_idx" ON "tool_call_log"("session_id");

-- CreateIndex
CREATE INDEX "tool_call_log_project_id_idx" ON "tool_call_log"("project_id");

-- CreateIndex
CREATE INDEX "tool_call_log_project_id_created_at_idx" ON "tool_call_log"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "tool_call_log_created_at_idx" ON "tool_call_log"("created_at");

-- CreateIndex
CREATE INDEX "tool_call_log_tool_name_created_at_idx" ON "tool_call_log"("tool_name", "created_at");

-- CreateIndex
CREATE INDEX "tool_call_log_agent_name_created_at_idx" ON "tool_call_log"("agent_name", "created_at");

-- CreateIndex
CREATE INDEX "tool_call_log_session_id_tool_name_idx" ON "tool_call_log"("session_id", "tool_name");

-- CreateIndex
CREATE INDEX "token_usage_event_session_id_idx" ON "token_usage_event"("session_id");

-- CreateIndex
CREATE INDEX "token_usage_event_project_id_idx" ON "token_usage_event"("project_id");

-- CreateIndex
CREATE INDEX "token_usage_event_project_id_recorded_at_idx" ON "token_usage_event"("project_id", "recorded_at");

-- CreateIndex
CREATE INDEX "token_usage_event_card_id_idx" ON "token_usage_event"("card_id");

-- CreateIndex
CREATE INDEX "token_usage_event_signal_idx" ON "token_usage_event"("signal");

-- CreateIndex
CREATE INDEX "baseline_snapshot_project_id_idx" ON "baseline_snapshot"("project_id");

-- CreateIndex
CREATE INDEX "baseline_snapshot_project_id_measured_at_idx" ON "baseline_snapshot"("project_id", "measured_at");

-- CreateIndex
CREATE INDEX "edition_board_id_generated_at_idx" ON "edition"("board_id", "generated_at");

-- CreateIndex
CREATE INDEX "edition_project_id_generated_at_idx" ON "edition"("project_id", "generated_at");

-- CreateIndex
CREATE INDEX "edition_board_id_period_start_period_end_idx" ON "edition"("board_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "edition_board_id_slug_key" ON "edition"("board_id", "slug");

