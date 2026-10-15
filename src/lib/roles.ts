export type AppRole = 'ADMIN' | 'MANAGER' | 'SALES_EXECUTIVE' | 'ENGINEER' | 'CUSTOMER' | 'SUPER_ADMIN';

export const ENGINEER_ROLES: AppRole[] = ['ENGINEER'];

export function isEngineer(role: string | undefined): boolean {
  return ENGINEER_ROLES.includes(role as AppRole);
}

export function formatRole(role: string | undefined): string {
  return (role || 'User').replace(/_/g, ' ');
}
