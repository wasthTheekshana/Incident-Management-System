import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from './auth.types';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const ALLOW_PASSWORD_CHANGE_PENDING = 'allowPasswordChangePending';

/** Skips authentication. Use only for login / password-reset entry points. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restricts a route to the given roles. Routes without it are open to any authenticated user. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Lets a user with a forced password change pending reach this route (e.g. the change-password call itself). */
export const AllowPasswordChangePending = () => SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});
