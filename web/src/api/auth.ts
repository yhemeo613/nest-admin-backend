import request from '@/utils/http'

/**
 * 登录
 * @param params 登录参数
 * @returns 双 Token（accessToken / refreshToken）
 */
export function fetchLogin(params: Api.Auth.LoginParams) {
  return request.post<Api.Auth.LoginResponse>({
    url: '/api/v1/auth/login',
    params
  })
}

/**
 * 刷新令牌
 */
export function fetchRefreshToken(refreshToken: string) {
  return request.post<Api.Auth.LoginResponse>({
    url: '/api/v1/auth/refresh',
    params: { refreshToken }
  })
}

/**
 * 登出
 */
export function fetchLogout() {
  return request.post<null>({
    url: '/api/v1/auth/logout'
  })
}

/**
 * 获取当前用户档案（用户信息 + 角色 + 权限码 + 菜单树）
 * 后端返回 { user, roles, permissions, menus }，此处映射为前端 UserInfo 结构
 */
export async function fetchGetUserInfo(): Promise<Api.Auth.UserInfo> {
  const profile = await request.get<{
    user: {
      id: string
      username: string
      nickname: string
      avatar: string | null
      deptId: string | null
      isSuper: boolean
    }
    roles: string[]
    permissions: string[]
    menus: Api.Auth.MenuNode[]
  }>({
    url: '/api/v1/auth/profile'
  })
  return {
    userId: profile.user.id,
    userName: profile.user.username,
    nickName: profile.user.nickname,
    avatar: profile.user.avatar ?? undefined,
    deptId: profile.user.deptId,
    isSuper: profile.user.isSuper,
    roles: profile.roles,
    permissions: profile.permissions,
    menus: profile.menus
  }
}
