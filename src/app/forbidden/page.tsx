import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="max-w-md rounded-2xl border border-black/[0.06] bg-[#f5f5f7] p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#86868b]">403</p>
        <h1 className="mt-3 text-2xl font-bold text-[#1d1d1f]">当前会员方案暂无此权限</h1>
        <p className="mt-3 text-sm leading-6 text-[#555555]">
          你已登录，但当前会员方案没有访问这个页面或操作这项功能的权限。
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/home"
            className="rounded-full bg-[#1d1d1f] px-5 py-2 text-sm font-medium text-white"
          >
            返回首页
          </Link>
          <Link
            href="/membership"
            className="rounded-full border border-black/[0.08] bg-white px-5 py-2 text-sm font-medium text-[#1d1d1f]"
          >
            查看会员
          </Link>
        </div>
      </div>
    </div>
  );
}
