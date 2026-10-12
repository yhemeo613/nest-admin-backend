import { SetMetadata } from '@nestjs/common';

export const SKIP_WRAP_KEY = 'skipWrap';

/** 跳过统一响应包装（SSE 流式接口、文件下载等场景） */
export const SkipWrap = () => SetMetadata(SKIP_WRAP_KEY, true);
