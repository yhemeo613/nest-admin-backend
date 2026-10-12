/**
 * 业务错误码（唯一事实来源）。
 * 分段约定：
 *   0      成功
 *   40xxx  通用 HTTP 语义错误
 *   10xxx  用户/认证域
 *   11xxx  角色/权限/部门域
 *   20xxx  AI 域
 *   50xxx  服务端内部错误
 */
export enum ErrorCode {
  SUCCESS = 0,

  BAD_REQUEST = 40000,
  UNAUTHORIZED = 40101,
  TOKEN_INVALID = 40102,
  FORBIDDEN = 40301,
  NOT_FOUND = 40400,
  CONFLICT = 40900,
  TOO_MANY_REQUESTS = 42900,

  LOGIN_FAILED = 10001,
  USER_DISABLED = 10002,
  USER_NOT_FOUND = 10003,
  USERNAME_EXISTS = 10004,

  ROLE_NOT_FOUND = 11001,
  ROLE_CODE_EXISTS = 11002,
  ROLE_IN_USE = 11003,
  PERMISSION_NOT_FOUND = 11101,
  PERMISSION_CODE_EXISTS = 11102,
  PERMISSION_HAS_CHILDREN = 11103,
  PERMISSION_IN_USE = 11104,
  DEPT_NOT_FOUND = 11201,
  DEPT_HAS_CHILDREN = 11202,
  DEPT_HAS_USERS = 11203,

  AI_CALL_FAILED = 20001,
  AI_BUDGET_EXCEEDED = 20002,
  AI_CONTENT_BLOCKED = 20003,

  INTERNAL_ERROR = 50000,
}

export const ErrorMessage: Record<ErrorCode, string> = {
  [ErrorCode.SUCCESS]: 'ok',
  [ErrorCode.BAD_REQUEST]: '请求参数错误',
  [ErrorCode.UNAUTHORIZED]: '未登录或登录已过期',
  [ErrorCode.TOKEN_INVALID]: '令牌无效或已过期',
  [ErrorCode.FORBIDDEN]: '无操作权限',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.CONFLICT]: '数据冲突',
  [ErrorCode.TOO_MANY_REQUESTS]: '请求过于频繁，请稍后再试',
  [ErrorCode.LOGIN_FAILED]: '用户名或密码错误',
  [ErrorCode.USER_DISABLED]: '账号已被禁用',
  [ErrorCode.USER_NOT_FOUND]: '用户不存在',
  [ErrorCode.USERNAME_EXISTS]: '用户名已存在',
  [ErrorCode.ROLE_NOT_FOUND]: '角色不存在',
  [ErrorCode.ROLE_CODE_EXISTS]: '角色编码已存在',
  [ErrorCode.ROLE_IN_USE]: '角色已分配给用户，无法删除',
  [ErrorCode.PERMISSION_NOT_FOUND]: '权限点不存在',
  [ErrorCode.PERMISSION_CODE_EXISTS]: '权限码已存在',
  [ErrorCode.PERMISSION_HAS_CHILDREN]: '存在子权限，无法删除',
  [ErrorCode.PERMISSION_IN_USE]: '权限点已分配给角色，无法删除',
  [ErrorCode.DEPT_NOT_FOUND]: '部门不存在',
  [ErrorCode.DEPT_HAS_CHILDREN]: '存在子部门，无法删除',
  [ErrorCode.DEPT_HAS_USERS]: '部门下存在用户，无法删除',
  [ErrorCode.AI_CALL_FAILED]: 'AI 服务调用失败，请稍后重试',
  [ErrorCode.AI_BUDGET_EXCEEDED]: 'AI 调用额度已用尽',
  [ErrorCode.AI_CONTENT_BLOCKED]: '内容未通过安全审核',
  [ErrorCode.INTERNAL_ERROR]: '服务器内部错误',
};
