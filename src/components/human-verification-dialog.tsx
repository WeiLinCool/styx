'use client';

import { useEffect, useState } from 'react';
import {
  LoadCanvasTemplate,
  loadCaptchaEnginge,
  validateCaptcha,
} from 'react-simple-captcha';

const CAPTCHA_LENGTH = 4;

type HumanVerificationDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  busy?: boolean;
  onCancel: () => void;
  onVerified: () => Promise<void>;
};

export function HumanVerificationDialog({
  open,
  title,
  description,
  busy = false,
  onCancel,
  onVerified,
}: HumanVerificationDialogProps) {
  const [value, setValue] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setValue('');
    setErrorMessage('');
    window.setTimeout(() => {
      loadCaptchaEnginge(CAPTCHA_LENGTH, '#ffffff', '#111827', 'numbers');
    }, 0);
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = async () => {
    if (!validateCaptcha(value.trim(), false)) {
      setErrorMessage('验证码不正确，请重新输入。');
      loadCaptchaEnginge(CAPTCHA_LENGTH, '#ffffff', '#111827', 'numbers');
      setValue('');
      return;
    }

    setErrorMessage('');
    await onVerified();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full max-w-[360px] rounded-2xl bg-white p-5 shadow-2xl shadow-black/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-[#1d1d1f]">{title}</h2>
            {description ? (
              <p className="mt-1 text-xs leading-relaxed text-[#86868b]">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-sm text-[#86868b] disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-black/[0.08] bg-[#f7f7f8] p-3 shadow-inner shadow-black/[0.03]">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[#6e6e73]">4位数字验证码</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-[#86868b] shadow-sm">
              点击刷新
            </span>
          </div>
          <div className="[&>div]:flex [&>div]:items-center [&>div]:justify-between [&>div]:gap-3 [&_canvas]:h-14 [&_canvas]:w-[150px] [&_canvas]:rounded-xl [&_canvas]:border [&_canvas]:border-black/[0.06] [&_canvas]:bg-white [&_canvas]:shadow-sm [&_a]:inline-flex [&_a]:h-9 [&_a]:shrink-0 [&_a]:items-center [&_a]:justify-center [&_a]:rounded-full [&_a]:bg-[#1d1d1f] [&_a]:px-3 [&_a]:text-xs [&_a]:font-medium [&_a]:!text-white [&_a]:no-underline [&_a]:transition-colors hover:[&_a]:bg-[#333333]">
            <LoadCanvasTemplate reloadText="换一张" reloadColor="#ffffff" />
          </div>
        </div>

        <input
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/\D/g, '').slice(0, CAPTCHA_LENGTH))}
          placeholder="输入4位数字验证码"
          inputMode="numeric"
          pattern="[0-9]*"
          className="mt-3 h-11 w-full rounded-xl border border-black/[0.08] bg-white px-3 text-center text-lg font-semibold tracking-[0.35em] text-[#1d1d1f] outline-none transition-colors placeholder:text-left placeholder:text-sm placeholder:font-normal placeholder:tracking-normal focus:border-[#1d1d1f]"
          autoFocus
        />
        {errorMessage ? (
          <p className="mt-2 text-xs text-[#b91c1c]">{errorMessage}</p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-10 flex-1 rounded-xl bg-[#f5f5f7] text-sm font-medium text-[#1d1d1f] disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || !value.trim()}
            className="h-10 flex-1 rounded-xl bg-[#1d1d1f] text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? '验证中' : '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}
