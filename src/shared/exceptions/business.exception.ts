import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode, ErrorMessage } from '@/shared/constants/error-code';

/** 错误码到 HTTP 状态的默认映射（可在抛出时显式覆盖） */
const CODE_HTTP_MAP: Partial<Record<ErrorCode, HttpStatus>> = {
  [ErrorCode.BAD_REQUEST]: HttpStatus.BAD_REQUEST,
  [ErrorCode.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.TOKEN_INVALID]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.FORBIDDEN]: HttpStatus.FORBIDDEN,
  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.CONFLICT]: HttpStatus.CONFLICT,
  [ErrorCode.TOO_MANY_REQUESTS]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.LOGIN_FAILED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.USER_DISABLED]: HttpStatus.FORBIDDEN,
  [ErrorCode.USER_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.USERNAME_EXISTS]: HttpStatus.CONFLICT,
  [ErrorCode.OLD_PASSWORD_WRONG]: HttpStatus.BAD_REQUEST,
  [ErrorCode.ROLE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.ROLE_CODE_EXISTS]: HttpStatus.CONFLICT,
  [ErrorCode.ROLE_IN_USE]: HttpStatus.CONFLICT,
  [ErrorCode.PERMISSION_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.PERMISSION_CODE_EXISTS]: HttpStatus.CONFLICT,
  [ErrorCode.PERMISSION_HAS_CHILDREN]: HttpStatus.CONFLICT,
  [ErrorCode.PERMISSION_IN_USE]: HttpStatus.CONFLICT,
  [ErrorCode.DEPT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.DEPT_HAS_CHILDREN]: HttpStatus.CONFLICT,
  [ErrorCode.DEPT_HAS_USERS]: HttpStatus.CONFLICT,
  [ErrorCode.AI_CALL_FAILED]: HttpStatus.BAD_GATEWAY,
  [ErrorCode.AI_BUDGET_EXCEEDED]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.AI_CONTENT_BLOCKED]: HttpStatus.BAD_REQUEST,
  [ErrorCode.TENANT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.TENANT_CODE_EXISTS]: HttpStatus.CONFLICT,
  [ErrorCode.API_KEY_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.API_KEY_INVALID]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.CONVERSATION_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * 业务异常：业务代码中只允许抛出此异常表达业务错误。
 * 全局过滤器会将其格式化为统一响应结构。
 */
export class BusinessException extends HttpException {
  readonly bizCode: ErrorCode;

  constructor(code: ErrorCode, message?: string, status?: HttpStatus) {
    super(
      { code, message: message ?? ErrorMessage[code] },
      status ?? CODE_HTTP_MAP[code] ?? HttpStatus.BAD_REQUEST,
    );
    this.bizCode = code;
  }
}
