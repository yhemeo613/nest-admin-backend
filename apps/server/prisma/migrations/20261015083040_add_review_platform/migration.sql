-- CreateEnum
CREATE TYPE "ReviewPlatform" AS ENUM ('GITLAB', 'GITHUB');

-- CreateEnum
CREATE TYPE "ReviewTaskMode" AS ENUM ('RANGE', 'COMMIT', 'MR');

-- CreateEnum
CREATE TYPE "ReviewTaskStatus" AS ENUM ('PENDING', 'PREPARING', 'RUNNING', 'EVALUATING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewGateStatus" AS ENUM ('PASS', 'FAIL', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReviewFindingStatus" AS ENUM ('OPEN', 'FIXED', 'IGNORED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReviewNotifType" AS ENUM ('TASK_FINISHED', 'TASK_FAILED', 'GATE_FAILED');

-- AlterTable
ALTER TABLE "sys_permission" ADD COLUMN     "is_hidden" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "KbArticleStatus";

-- CreateTable
CREATE TABLE "review_repo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "ReviewPlatform" NOT NULL,
    "gitUrl" TEXT NOT NULL,
    "default_branch" TEXT NOT NULL DEFAULT 'main',
    "credential_enc" TEXT,
    "workspace_status" TEXT NOT NULL DEFAULT 'NONE',
    "last_sync_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "review_repo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_model" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'openai',
    "base_url" TEXT NOT NULL,
    "api_key_enc" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "extra_body" JSONB,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "Status" NOT NULL DEFAULT 'ENABLED',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "review_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_task" (
    "id" TEXT NOT NULL,
    "repo_id" TEXT NOT NULL,
    "model_id" TEXT,
    "mode" "ReviewTaskMode" NOT NULL,
    "from_ref" TEXT,
    "to_ref" TEXT,
    "commit_sha" TEXT,
    "mr_url" TEXT,
    "mr_iid" INTEGER,
    "platform_project" TEXT,
    "mr_state" TEXT,
    "mr_discussion_url" TEXT,
    "requirement_background" TEXT,
    "status" "ReviewTaskStatus" NOT NULL DEFAULT 'PENDING',
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "session_id" TEXT,
    "result_path" TEXT,
    "diff_path" TEXT,
    "home_dir" TEXT,
    "gate_status" "ReviewGateStatus",
    "gate_detail" JSONB,
    "stats" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "review_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_finding" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "start_line" INTEGER NOT NULL,
    "end_line" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "thinking" TEXT,
    "category" TEXT NOT NULL DEFAULT 'other',
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "suggestion_code" TEXT,
    "existing_code" TEXT,
    "fingerprint" TEXT NOT NULL,
    "status" "ReviewFindingStatus" NOT NULL DEFAULT 'OPEN',
    "is_new" BOOLEAN NOT NULL DEFAULT true,
    "first_seen_task_id" TEXT,
    "last_seen_task_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "review_finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_trace_call" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "request_no" INTEGER,
    "task_type" TEXT,
    "file_path" TEXT,
    "model" TEXT,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "status_code" INTEGER,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "raw_path" TEXT NOT NULL,
    "raw_offset" INTEGER NOT NULL,
    "raw_len" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_trace_call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_gate_rule" (
    "id" TEXT NOT NULL,
    "repo_id" TEXT,
    "max_critical" INTEGER,
    "max_high" INTEGER,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "review_gate_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_notif" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "ReviewNotifType" NOT NULL,
    "task_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_notif_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_repo_gitUrl_key" ON "review_repo"("gitUrl");

-- CreateIndex
CREATE INDEX "review_repo_deleted_at_idx" ON "review_repo"("deleted_at");

-- CreateIndex
CREATE INDEX "review_model_deleted_at_idx" ON "review_model"("deleted_at");

-- CreateIndex
CREATE INDEX "review_task_repo_id_idx" ON "review_task"("repo_id");

-- CreateIndex
CREATE INDEX "review_task_status_idx" ON "review_task"("status");

-- CreateIndex
CREATE INDEX "review_task_created_at_idx" ON "review_task"("created_at");

-- CreateIndex
CREATE INDEX "review_finding_task_id_idx" ON "review_finding"("task_id");

-- CreateIndex
CREATE INDEX "review_finding_fingerprint_idx" ON "review_finding"("fingerprint");

-- CreateIndex
CREATE INDEX "review_finding_status_idx" ON "review_finding"("status");

-- CreateIndex
CREATE INDEX "review_trace_call_task_id_idx" ON "review_trace_call"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_trace_call_task_id_seq_key" ON "review_trace_call"("task_id", "seq");

-- CreateIndex
CREATE INDEX "review_gate_rule_repo_id_idx" ON "review_gate_rule"("repo_id");

-- CreateIndex
CREATE INDEX "review_notif_user_id_idx" ON "review_notif"("user_id");

-- CreateIndex
CREATE INDEX "review_notif_is_read_idx" ON "review_notif"("is_read");

-- AddForeignKey
ALTER TABLE "review_task" ADD CONSTRAINT "review_task_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "review_repo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_task" ADD CONSTRAINT "review_task_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "review_model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_finding" ADD CONSTRAINT "review_finding_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "review_task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_trace_call" ADD CONSTRAINT "review_trace_call_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "review_task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_gate_rule" ADD CONSTRAINT "review_gate_rule_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "review_repo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_notif" ADD CONSTRAINT "review_notif_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "review_task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
