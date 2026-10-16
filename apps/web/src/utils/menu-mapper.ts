/**
 * 后端菜单树 → 前端路由记录映射器
 *
 * 后端 /auth/profile 下发的菜单节点（DIR/MENU）映射为模板 AppRouteRecord：
 * - DIR 目录：Layout 包裹的分组节点，children 为页面
 * - MENU 菜单：叶子页面，component 由 path 按约定推导（/system/user → views/system/user/index.vue）
 * - 标题直接使用后端下发的名称（中文原文），图标透传（iconify 格式如 ri:xxx）
 * - 子节点 path 取相对顶级 DIR 的路径（支持多级，如 /review/task/detail → task/detail）
 */
import { AppRouteRecord } from '@/types/router'

/** 路径转路由 name（/system/user → SystemUser） */
function pathToRouteName(path: string | null, code: string): string {
  const source = path || code
  return source
    .split(/[/:]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

/** 菜单路径 → 组件路径（约定：views 下的相对路径） */
function pathToComponent(path: string | null): string {
  return path ?? ''
}

/** 子节点相对路径：去掉顶级 DIR 前缀（/review/task/detail 相对 /review → task/detail） */
function relativePath(fullPath: string | null, topPath: string): string {
  if (fullPath && topPath && fullPath.startsWith(topPath + '/')) {
    return fullPath.slice(topPath.length + 1)
  }
  return fullPath?.split('/').pop() ?? ''
}

function mapNode(node: Api.Auth.MenuNode, isTopLevel: boolean, topPath = ''): AppRouteRecord {
  const isDir = node.type === 'DIR'

  // 子节点 path 使用相对顶级 DIR 的路径（MenuProcessor 会规范化为完整路径）
  const path = isTopLevel
    ? (node.path ?? `/${node.code.replace(/:/g, '/')}`)
    : relativePath(node.path, topPath) || (node.code.split(':').pop() ?? '')

  // 递归时下传的顶级路径（顶层 DIR 的 path 作为子树的基准）
  const childTopPath = isTopLevel ? (node.path ?? '') : topPath
  const children = (node.children ?? []).map((child) => mapNode(child, false, childTopPath))

  const route: AppRouteRecord = {
    path,
    name: pathToRouteName(node.path, node.code),
    meta: {
      title: node.name,
      icon: node.icon ?? '',
      keepAlive: true,
      // 隐藏菜单（详情页等）：注册路由但不进侧栏/搜索
      isHide: node.isHidden === true
    }
  }

  if (isTopLevel) {
    if (!isDir && children.length === 0) {
      // 顶级独立菜单：RouteTransformer 会自动包一层 Layout，component 指向真实页面
      route.component = pathToComponent(node.path)
    } else {
      // 目录/带子菜单的节点：由 Layout 包裹
      route.component = '/index/index'
      route.children = children
    }
  } else if (isDir) {
    route.children = children
  } else {
    route.component = pathToComponent(node.path)
    if (children.length) route.children = children
  }

  return route
}

/** 菜单树映射为路由记录数组 */
export function mapMenuNodesToRoutes(nodes: Api.Auth.MenuNode[]): AppRouteRecord[] {
  return nodes.map((node) => mapNode(node, true))
}
