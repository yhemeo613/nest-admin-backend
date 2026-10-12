import { SetMetadata } from '@nestjs/common';

import { PermissionCodeValue } from '@/shared/constants/permission-code';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * 声明接口所需权限码（满足其一即可）。
 * 未标注的接口默认"登录即可访问"。
 */
export const RequirePermissions = (...codes: PermissionCodeValue[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, codes);
