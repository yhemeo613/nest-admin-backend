import { AppRouteRecord } from '@/types/router'
import request from '@/utils/http'
import { mapMenuNodesToRoutes } from '@/utils/menu-mapper'
import { useUserStore } from '@/store/modules/user'

// ==================== 用户 ====================

/** 用户分页列表 */
export function fetchGetUserList(params: Api.SystemManage.UserSearchParams) {
  return request.get<Api.SystemManage.UserList>({
    url: '/api/v1/system/users',
    params
  })
}

/** 新增用户 */
export function fetchCreateUser(data: {
  username: string
  password: string
  nickname: string
  email?: string
  phone?: string
  deptId?: string
  roleIds?: string[]
}) {
  return request.post<Api.SystemManage.UserListItem>({ url: '/api/v1/system/users', params: data })
}

/** 修改用户 */
export function fetchUpdateUser(
  id: string,
  data: Partial<{ nickname: string; email: string; phone: string; deptId: string }>
) {
  return request.put<Api.SystemManage.UserListItem>({
    url: `/api/v1/system/users/${id}`,
    params: data
  })
}

/** 删除用户 */
export function fetchDeleteUser(id: string) {
  return request.del<null>({ url: `/api/v1/system/users/${id}` })
}

/** 分配角色 */
export function fetchAssignUserRoles(id: string, roleIds: string[]) {
  return request.put<null>({ url: `/api/v1/system/users/${id}/roles`, params: { roleIds } })
}

/** 重置密码 */
export function fetchResetUserPassword(id: string, password: string) {
  return request.put<null>({ url: `/api/v1/system/users/${id}/password`, params: { password } })
}

/** 启用/禁用用户 */
export function fetchUpdateUserStatus(id: string, status: Api.Common.EnableStatus) {
  return request.request<null>({
    url: `/api/v1/system/users/${id}/status`,
    method: 'PATCH',
    data: { status }
  })
}

// ==================== 角色 ====================

/** 角色分页列表 */
export function fetchGetRoleList(params: Api.SystemManage.RoleSearchParams) {
  return request.get<Api.SystemManage.RoleList>({
    url: '/api/v1/system/roles',
    params
  })
}

/** 新增角色 */
export function fetchCreateRole(data: {
  code: string
  name: string
  dataScope?: Api.SystemManage.RoleListItem['dataScope']
  deptIds?: string[]
  sort?: number
  remark?: string
}) {
  return request.post<Api.SystemManage.RoleListItem>({ url: '/api/v1/system/roles', params: data })
}

/** 修改角色 */
export function fetchUpdateRole(
  id: string,
  data: Partial<{ code: string; name: string; sort: number; remark: string }>
) {
  return request.put<Api.SystemManage.RoleListItem>({
    url: `/api/v1/system/roles/${id}`,
    params: data
  })
}

/** 删除角色 */
export function fetchDeleteRole(id: string) {
  return request.del<null>({ url: `/api/v1/system/roles/${id}` })
}

/** 角色分配权限点 */
export function fetchAssignRolePermissions(id: string, permissionIds: string[]) {
  return request.put<null>({
    url: `/api/v1/system/roles/${id}/permissions`,
    params: { permissionIds }
  })
}

/** 配置角色数据权限范围 */
export function fetchSetRoleDataScope(
  id: string,
  dataScope: Api.SystemManage.RoleListItem['dataScope'],
  deptIds?: string[]
) {
  return request.put<null>({
    url: `/api/v1/system/roles/${id}/data-scope`,
    params: { dataScope, deptIds }
  })
}

// ==================== 权限点（菜单/按钮） ====================

/** 权限树（管理端） */
export function fetchGetPermissionTree() {
  return request.get<Api.SystemManage.PermissionItem[]>({
    url: '/api/v1/system/permissions/tree'
  })
}

/** 新增权限点 */
export function fetchCreatePermission(data: {
  parentId?: string
  name: string
  code: string
  type: Api.SystemManage.PermissionItem['type']
  path?: string
  icon?: string
  sort?: number
}) {
  return request.post<Api.SystemManage.PermissionItem>({
    url: '/api/v1/system/permissions',
    params: data
  })
}

/** 修改权限点 */
export function fetchUpdatePermission(
  id: string,
  data: Partial<{
    name: string
    code: string
    path: string
    icon: string
    sort: number
    status: Api.Common.EnableStatus
  }>
) {
  return request.put<Api.SystemManage.PermissionItem>({
    url: `/api/v1/system/permissions/${id}`,
    params: data
  })
}

/** 删除权限点 */
export function fetchDeletePermission(id: string) {
  return request.del<null>({ url: `/api/v1/system/permissions/${id}` })
}

// ==================== 部门 ====================

/** 部门树 */
export function fetchGetDeptTree() {
  return request.get<Api.SystemManage.DeptItem[]>({
    url: '/api/v1/system/depts/tree'
  })
}

/** 新增部门 */
export function fetchCreateDept(data: { parentId?: string; name: string; sort?: number }) {
  return request.post<Api.SystemManage.DeptItem>({ url: '/api/v1/system/depts', params: data })
}

/** 修改部门 */
export function fetchUpdateDept(
  id: string,
  data: Partial<{ name: string; sort: number; status: Api.Common.EnableStatus; parentId: string }>
) {
  return request.put<Api.SystemManage.DeptItem>({
    url: `/api/v1/system/depts/${id}`,
    params: data
  })
}

/** 删除部门 */
export function fetchDeleteDept(id: string) {
  return request.del<null>({ url: `/api/v1/system/depts/${id}` })
}

// ==================== 菜单（动态路由） ====================

/**
 * 获取菜单数据（后端权限模式）。
 * 菜单树已随 /auth/profile 下发并缓存在 userStore，这里只做格式映射，不重复请求。
 */
export function fetchGetMenuList(): Promise<AppRouteRecord[]> {
  const menus = useUserStore().info?.menus ?? []
  return Promise.resolve(mapMenuNodesToRoutes(menus))
}
