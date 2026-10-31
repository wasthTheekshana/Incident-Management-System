import { Role } from '@prisma/client';

/** The authenticated principal attached to every request by SessionGuard. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  companyIds: string[];
  sessionId: string;
}
