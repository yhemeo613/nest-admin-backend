-- CreateEnum
CREATE TYPE "KbArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "saas_kb" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" "Status" NOT NULL DEFAULT 'ENABLED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "saas_kb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_kb_article" (
    "id" TEXT NOT NULL,
    "kb_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "KbArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "seo_title" TEXT,
    "seo_description" TEXT,
    "published_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "saas_kb_article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_kb_tag" (
    "id" TEXT NOT NULL,
    "kb_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_kb_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_kb_article_tag" (
    "article_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "saas_kb_article_tag_pkey" PRIMARY KEY ("article_id","tag_id")
);

-- CreateIndex
CREATE INDEX "saas_kb_tenant_id_idx" ON "saas_kb"("tenant_id");

-- CreateIndex
CREATE INDEX "saas_kb_article_tenant_id_status_idx" ON "saas_kb_article"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "saas_kb_article_kb_id_status_idx" ON "saas_kb_article"("kb_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "saas_kb_article_kb_id_slug_key" ON "saas_kb_article"("kb_id", "slug");

-- CreateIndex
CREATE INDEX "saas_kb_tag_tenant_id_idx" ON "saas_kb_tag"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "saas_kb_tag_kb_id_name_key" ON "saas_kb_tag"("kb_id", "name");

-- AddForeignKey
ALTER TABLE "saas_kb" ADD CONSTRAINT "saas_kb_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_kb_article" ADD CONSTRAINT "saas_kb_article_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "saas_kb"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_kb_tag" ADD CONSTRAINT "saas_kb_tag_kb_id_fkey" FOREIGN KEY ("kb_id") REFERENCES "saas_kb"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_kb_article_tag" ADD CONSTRAINT "saas_kb_article_tag_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "saas_kb_article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_kb_article_tag" ADD CONSTRAINT "saas_kb_article_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "saas_kb_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
