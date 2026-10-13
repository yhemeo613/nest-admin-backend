import { AiToolsService } from './ai-tools.service';

function createServiceStub() {
  return new AiToolsService(
    {} as never,
    { getUserPermCodes: jest.fn().mockResolvedValue(new Set(['system:user:list'])) } as never,
    { summary: jest.fn().mockResolvedValue([]) } as never,
    { emit: jest.fn() } as never,
  );
}

describe('AiToolsService（工具注册表，zod 规格）', () => {
  it('toAgentSpecs 导出 9 个工具且名称与旧版一致', () => {
    const specs = createServiceStub().toAgentSpecs();
    expect(specs.map((s) => s.name)).toEqual([
      'get_system_overview',
      'search_users',
      'create_user',
      'assign_user_roles',
      'list_roles',
      'get_dept_tree',
      'list_permissions',
      'set_role_permissions',
      'get_ai_usage',
    ]);
  });

  it('无参工具 schema 接受空对象', () => {
    const specs = createServiceStub().toAgentSpecs();
    const overview = specs.find((s) => s.name === 'get_system_overview');
    expect(overview?.schema.safeParse({}).success).toBe(true);
  });

  it('create_user schema 校验必填与用户名格式', () => {
    const specs = createServiceStub().toAgentSpecs();
    const createUser = specs.find((s) => s.name === 'create_user');
    expect(createUser?.schema.safeParse({ username: 'ab', nickname: '张三' }).success).toBe(true);
    expect(createUser?.schema.safeParse({ nickname: '张三' }).success).toBe(false);
    expect(createUser?.schema.safeParse({ username: 'bad-name!', nickname: '张三' }).success).toBe(
      false,
    );
  });

  it('写工具均带权限码门控', () => {
    const specs = createServiceStub().toAgentSpecs();
    const writeTools = ['create_user', 'assign_user_roles', 'set_role_permissions'];
    for (const name of writeTools) {
      expect(specs.find((s) => s.name === name)?.permission).toBeTruthy();
    }
  });
});
