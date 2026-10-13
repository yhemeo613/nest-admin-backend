/**
 * 快速入口配置
 * 包含：应用列表、快速链接等配置
 * 说明：routeName 为前端路由 name（与后端菜单 path 映射规则一致：
 *       /saas/tenant → SaasTenant，见 src/utils/menu-mapper.ts）
 */
import type { FastEnterConfig } from '@/types/config'

const fastEnterConfig: FastEnterConfig = {
  // 显示条件（屏幕宽度）
  minWidth: 1200,
  // 应用列表
  applications: [
    {
      name: '工作台',
      description: '系统概览与数据统计',
      icon: 'ri:home-smile-line',
      iconColor: '#377dff',
      enabled: true,
      order: 1,
      routeName: 'Console'
    },
    {
      name: 'AI 问答',
      description: '与智能助手对话',
      icon: 'ri:chat-4-line',
      iconColor: '#13DEB9',
      enabled: true,
      order: 2,
      routeName: 'AiChat'
    },
    {
      name: '模型配置',
      description: '供应商与模型管理',
      icon: 'ri:cpu-line',
      iconColor: '#7A7FFF',
      enabled: true,
      order: 3,
      routeName: 'AiConfig'
    },
    {
      name: '用量报表',
      description: '调用次数与成本统计',
      icon: 'ri:bar-chart-line',
      iconColor: '#38C0FC',
      enabled: true,
      order: 4,
      routeName: 'AiUsage'
    },
    {
      name: '租户管理',
      description: 'SaaS 租户与接入 Key',
      icon: 'ri:building-line',
      iconColor: '#ffb100',
      enabled: true,
      order: 5,
      routeName: 'SaasTenant'
    },
    {
      name: '访客会话',
      description: '访客咨询记录查看',
      icon: 'ri:question-answer-line',
      iconColor: '#FF6B6B',
      enabled: true,
      order: 6,
      routeName: 'SaasConversation'
    },
    {
      name: '用户管理',
      description: '系统账号与角色分配',
      icon: 'ri:team-line',
      iconColor: '#637AFF',
      enabled: true,
      order: 7,
      routeName: 'SystemUser'
    },
    {
      name: '权限管理',
      description: '菜单与按钮权限配置',
      icon: 'ri:shield-keyhole-line',
      iconColor: '#FFA940',
      enabled: true,
      order: 8,
      routeName: 'SystemMenu'
    }
  ],
  // 快速链接
  quickLinks: [
    {
      name: '个人中心',
      enabled: true,
      order: 1,
      routeName: 'UserCenter'
    },
    {
      name: '角色管理',
      enabled: true,
      order: 2,
      routeName: 'SystemRole'
    },
    {
      name: '部门管理',
      enabled: true,
      order: 3,
      routeName: 'SystemDept'
    },
    {
      name: 'AI 用量',
      enabled: true,
      order: 4,
      routeName: 'AiUsage'
    }
  ]
}

export default Object.freeze(fastEnterConfig)
