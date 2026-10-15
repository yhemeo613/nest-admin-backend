-- CreateTable
CREATE TABLE "sys_notification" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sys_notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sys_notification_user_id_read_at_idx" ON "sys_notification"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "sys_notification_created_at_idx" ON "sys_notification"("created_at");
