/**
 * 快速入口配置
 * 包含：应用列表、快速链接等配置
 * 说明：routeName 为前端路由 name（由后端菜单 path 映射生成，见 src/utils/menu-mapper.ts）
 */
import type { FastEnterConfig } from '@/types/config'

const fastEnterConfig: FastEnterConfig = {
  // 显示条件（屏幕宽度）
  minWidth: 1200,
  // 应用列表
  applications: [
    {
      name: '用户管理',
      description: '系统账号与角色分配',
      icon: 'ri:team-line',
      iconColor: '#637AFF',
      enabled: true,
      order: 1,
      routeName: 'SystemUser'
    },
    {
      name: '角色管理',
      description: '角色与权限分配',
      icon: 'ri:user-settings-line',
      iconColor: '#13DEB9',
      enabled: true,
      order: 2,
      routeName: 'SystemRole'
    },
    {
      name: '权限管理',
      description: '菜单与按钮权限配置',
      icon: 'ri:shield-keyhole-line',
      iconColor: '#FFA940',
      enabled: true,
      order: 3,
      routeName: 'SystemMenu'
    },
    {
      name: '部门管理',
      description: '组织架构维护',
      icon: 'ri:organization-chart',
      iconColor: '#38C0FC',
      enabled: true,
      order: 4,
      routeName: 'SystemDept'
    }
  ],
  // 快速链接
  quickLinks: [
    {
      name: '个人中心',
      enabled: true,
      order: 1,
      routeName: 'UserCenter'
    }
  ]
}

export default Object.freeze(fastEnterConfig)
