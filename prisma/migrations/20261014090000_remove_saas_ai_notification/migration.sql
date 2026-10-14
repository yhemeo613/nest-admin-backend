-- 客服系统（SaaS 多租户/知识库/会话/挂件）、AI 基础设施与站内通知功能整体下线，删除对应表

-- SaaS 知识库（多对多关联表最先删）
DROP TABLE IF EXISTS "saas_kb_article_tag";
DROP TABLE IF EXISTS "saas_kb_article";
DROP TABLE IF EXISTS "saas_kb_tag";
DROP TABLE IF EXISTS "saas_kb";

-- 访客会话与租户
DROP TABLE IF EXISTS "tenant_message";
DROP TABLE IF EXISTS "tenant_conversation";
DROP TABLE IF EXISTS "tenant_api_key";
DROP TABLE IF EXISTS "tenant";

-- AI 审计与模型配置
DROP TABLE IF EXISTS "ai_model";
DROP TABLE IF EXISTS "ai_provider";
DROP TABLE IF EXISTS "ai_call_log";

-- 站内通知
DROP TABLE IF EXISTS "sys_notification";
