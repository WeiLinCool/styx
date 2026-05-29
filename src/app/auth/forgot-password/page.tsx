import { ForgotPasswordForm } from '@/features/account/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] px-4 py-10">
      <div className="mx-auto max-w-md rounded-[28px] bg-white p-8 shadow-[0_20px_80px_rgba(0,0,0,0.08)]">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1d1d1f] text-sm font-bold text-white">
            NF
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#1d1d1f]">发起密码重置工单</h1>
          <p className="mt-2 text-sm leading-6 text-[#6e6e73]">
            提交工单后，客服审核通过会为你生成临时密码。你需要使用临时密码登录，并在下次进入时立即重置为新密码。
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
