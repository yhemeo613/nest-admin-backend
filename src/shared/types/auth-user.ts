/** 当前登录用户上下文（JwtAuthGuard 解析后挂到 request.user） */
export interface AuthUser {
  userId: string;
  username: string;
  nickname: string;
  isSuper: boolean;
  deptId: string | null;
  /** 自助注册租户的管理员：其归属租户 ID（非租户管理员为 null）——服务端强制数据隔离的依据 */
  tenantId?: string | null;
}

/** 统一响应结构 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  traceId?: string;
  timestamp: number;
}

/** JWT Access Token 载荷 */
export interface AccessTokenPayload {
  sub: string;
  username: string;
  isSuper: boolean;
}

/** JWT Refresh Token 载荷 */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}
