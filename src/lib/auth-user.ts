export function shouldReplaceAuthUser<T>(current: T | null, next: T): boolean {
  return JSON.stringify(current) !== JSON.stringify(next);
}
