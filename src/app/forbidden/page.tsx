import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md rounded-2xl border border-border bg-secondary/70 p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">403</p>
        <h1 className="mt-3 text-2xl font-bold text-foreground">当前会员方案暂无此权限</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          你已登录，但当前会员方案没有访问这个页面或操作这项功能的权限。
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/home"
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background"
          >
            返回首页
          </Link>
          <Link
            href="/membership"
            className="rounded-full border border-border bg-card px-5 py-2 text-sm font-medium text-foreground"
          >
            查看会员
          </Link>
        </div>
      </div>
    </div>
  );
}
