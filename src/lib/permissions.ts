export type Role = "owner" | "admin" | "staff";

export const ROLES: Role[] = ["owner", "admin", "staff"];

export const ROLE_LABELS: Record<Role, string> = { owner: "Owner", admin: "Admin", staff: "Staff" };

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Everything, including settings, integrations and the team.",
  admin: "Products, orders, content, promotions and reports. Cannot change settings or the team.",
  staff: "View products, update stock and handle orders. Cannot edit the catalogue or content.",
};

/** Who may do what. This is enforced on the server for every page, action and download: hiding a button is never the check. */
export const PERMISSIONS = {
  "products.view": ["owner", "admin", "staff"],
  "products.manage": ["owner", "admin"],
  "inventory.adjust": ["owner", "admin", "staff"],
  "orders.view": ["owner", "admin", "staff"],
  "orders.manage": ["owner", "admin", "staff"],
  "orders.export": ["owner", "admin"],
  "orders.payment": ["owner", "admin"],
  "promotions.manage": ["owner", "admin"],
  "content.manage": ["owner", "admin"],
  "analytics.view": ["owner", "admin"],
  "ai.use": ["owner", "admin"],
  "audit.view": ["owner", "admin"],
  "settings.manage": ["owner"],
  "team.manage": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
