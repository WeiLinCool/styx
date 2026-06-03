export type PermissionedMenuItem = {
  label: string;
  href: string;
  desc?: string;
  permissionCode?: string;
};

export function filterMenuItemsByPermissions<T extends PermissionedMenuItem>(
  items: T[],
  permissionCodes: string[],
) {
  return items.filter((item) => {
    if (!item.permissionCode) {
      return true;
    }

    return permissionCodes.includes(item.permissionCode);
  });
}
