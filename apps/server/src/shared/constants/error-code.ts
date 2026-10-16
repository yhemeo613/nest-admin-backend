/**
 * 业务错误码（唯一事实来源）。
 * 分段约定：
 *   0      成功
 *   40xxx  通用 HTTP 语义错误
 *   10xxx  用户/认证域
 *   11xxx  角色/权限/部门域
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
  OLD_PASSWORD_WRONG = 10005,

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

  // 代码评审域（12xxx）
  REVIEW_REPO_NOT_FOUND = 12001,
  REVIEW_MODEL_NOT_FOUND = 12002,
  REVIEW_TASK_NOT_FOUND = 12003,
  REVIEW_TASK_NOT_CANCELLABLE = 12004, // 任务已终态，不可取消/操作
  REVIEW_FINDING_NOT_FOUND = 12005,
  REVIEW_GATE_RULE_NOT_FOUND = 12006,
  REVIEW_GATE_CONFLICT = 12007, // 同作用域已有规则
  REVIEW_OCR_BINARY_MISSING = 12008, // ocr 二进制不可用
  REVIEW_MR_URL_INVALID = 12009, // MR/PR 链接无法解析
  REVIEW_PUBLISH_NOT_CONFIGURED = 12010, // 任务未配置 MR/PR，无法回写
  REVIEW_MODEL_TEST_FAILED = 12011, // 模型连通性测试失败
  REVIEW_CRYPTO_KEY_INVALID = 12012, // 解密失败（密钥不匹配或密文损坏）

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
  [ErrorCode.OLD_PASSWORD_WRONG]: '当前密码错误',
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
  [ErrorCode.REVIEW_REPO_NOT_FOUND]: '评审仓库不存在',
  [ErrorCode.REVIEW_MODEL_NOT_FOUND]: '模型配置不存在',
  [ErrorCode.REVIEW_TASK_NOT_FOUND]: '评审任务不存在',
  [ErrorCode.REVIEW_TASK_NOT_CANCELLABLE]: '任务已结束，无法执行该操作',
  [ErrorCode.REVIEW_FINDING_NOT_FOUND]: '评审发现不存在',
  [ErrorCode.REVIEW_GATE_RULE_NOT_FOUND]: '红线规则不存在',
  [ErrorCode.REVIEW_GATE_CONFLICT]: '该作用域已存在红线规则',
  [ErrorCode.REVIEW_OCR_BINARY_MISSING]: '评审引擎（ocr）不可用，请检查 OCR_BIN_PATH 配置',
  [ErrorCode.REVIEW_MR_URL_INVALID]: 'MR/PR 链接无法解析',
  [ErrorCode.REVIEW_PUBLISH_NOT_CONFIGURED]: '任务未配置 MR/PR 链接，无法回写',
  [ErrorCode.REVIEW_MODEL_TEST_FAILED]: '模型连通性测试失败',
  [ErrorCode.REVIEW_CRYPTO_KEY_INVALID]: '密文解密失败（密钥不匹配或数据损坏）',
  [ErrorCode.INTERNAL_ERROR]: '服务器内部错误',
};
