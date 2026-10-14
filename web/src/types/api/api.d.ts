/**
 * API 类型定义
 *
 * 与后端（nest-backend）接口结构一一对应：
 * - 统一响应 { code, message, data } 已由 http 层拆包，此处只声明 data 形状
 * - 分页响应统一为 { list, total, page, pageSize }
 * - 分页入参统一为 { page, pageSize }
 */

declare namespace Api {
  /** 通用类型 */
  namespace Common {
    /** 分页参数（与后端 PaginationDto 对应；current/size 为 useTable 内部状态字段名） */
    interface PaginationParams {
      page?: number
      pageSize?: number
      total?: number
      current?: number
      size?: number
    }

    type CommonSearchParams = Pick<PaginationParams, 'page' | 'pageSize'>

    /** 分页响应（与后端 PageResult 对应） */
    interface PaginatedResponse<T = any> {
      list: T[]
      total: number
      page: number
      pageSize: number
    }

    /** 启用状态（与后端 Status 枚举对应） */
    type EnableStatus = 'ENABLED' | 'DISABLED'
  }

  /** 认证 */
  namespace Auth {
    /** 登录参数 */
    interface LoginParams {
      username: string
      password: string
    }

    /** 登录响应 */
    interface LoginResponse {
      accessToken: string
      refreshToken: string
      expiresIn: number
    }

    /** 权限菜单节点（后端下发，DIR/MENU 两类） */
    interface MenuNode {
      id: string
      parentId: string | null
      name: string
      code: string
      type: 'DIR' | 'MENU'
      path: string | null
      icon: string | null
      sort: number
      children: MenuNode[]
    }

    /** 用户信息（GET /auth/profile 返回） */
    interface UserInfo {
      /** 权限码集合（按钮级权限依据，如 system:user:create） */
      permissions: string[]
      /** 角色编码集合 */
      roles: string[]
      /** 菜单树（动态路由依据） */
      menus: MenuNode[]
      userId: string
      userName: string
      nickName: string
      email?: string
      phone?: string
      avatar?: string
      deptId?: string | null
      isSuper?: boolean
    }
  }

  /** 系统管理 */
  namespace SystemManage {
    /** 用户列表 */
    type UserList = Api.Common.PaginatedResponse<UserListItem>

    /** 用户列表项（与后端 UserResponseDto 对应） */
    interface UserListItem {
      id: string
      username: string
      nickname: string
      email: string | null
      phone: string | null
      deptId: string | null
      deptName: string | null
      status: Api.Common.EnableStatus
      isSuper: boolean
      roles: string[]
      createdAt: string
    }

    type UserSearchParams = Partial<
      Pick<UserListItem, 'status' | 'deptId'> & { keyword: string } & Api.Common.CommonSearchParams
    >

    /** 角色列表 */
    type RoleList = Api.Common.PaginatedResponse<RoleListItem>

    /** 角色（与后端 RoleResponseDto 对应） */
    interface RoleListItem {
      id: string
      code: string
      name: string
      dataScope: 'ALL' | 'DEPT_AND_CHILDREN' | 'DEPT' | 'SELF' | 'CUSTOM'
      status: Api.Common.EnableStatus
      sort: number
      remark: string | null
      permissionIds: string[]
      deptIds: string[]
      createdAt: string
    }

    type RoleSearchParams = Partial<
      Pick<RoleListItem, 'status'> & { keyword: string } & Api.Common.CommonSearchParams
    >

    /** 权限点（目录/菜单/按钮/接口） */
    interface PermissionItem {
      id: string
      parentId: string | null
      name: string
      code: string
      type: 'DIR' | 'MENU' | 'BUTTON' | 'API'
      path: string | null
      icon: string | null
      sort: number
      status: Api.Common.EnableStatus
      children?: PermissionItem[]
    }

    /** 部门节点 */
    interface DeptItem {
      id: string
      parentId: string | null
      name: string
      sort: number
      status: Api.Common.EnableStatus
      createdAt: string
      children?: DeptItem[]
    }
  }
}
