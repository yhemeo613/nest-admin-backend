-- CreateTable
CREATE TABLE "tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ENABLED',
    "remark" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_api_key" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ENABLED',
    "last_used_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenant_api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_conversation" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenant_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_message" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenant_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_code_key" ON "tenant"("code");

-- CreateIndex
CREATE INDEX "tenant_status_idx" ON "tenant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_api_key_key_hash_key" ON "tenant_api_key"("key_hash");

-- CreateIndex
CREATE INDEX "tenant_api_key_tenant_id_idx" ON "tenant_api_key"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_conversation_tenant_id_updated_at_idx" ON "tenant_conversation"("tenant_id", "updated_at");

-- CreateIndex
CREATE INDEX "tenant_conversation_tenant_id_visitor_id_idx" ON "tenant_conversation"("tenant_id", "visitor_id");

-- CreateIndex
CREATE INDEX "tenant_message_conversation_id_created_at_idx" ON "tenant_message"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "tenant_message_tenant_id_idx" ON "tenant_message"("tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_api_key" ADD CONSTRAINT "tenant_api_key_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_conversation" ADD CONSTRAINT "tenant_conversation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_message" ADD CONSTRAINT "tenant_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "tenant_conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
