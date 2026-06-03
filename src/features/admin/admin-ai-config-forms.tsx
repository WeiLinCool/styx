'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { Loader2, Pencil, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { readJsonResponse } from '@/lib/api-response';
import { adminApiRequest } from '@/lib/admin-api-client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type {
  AdminAiModelRow,
  AdminAiProviderRow,
} from '@/server/repositories/ai-models';
import type { ProviderBillingRuleConfig } from '@/server/billing/provider-rules';
import { formatAdminAiLabel } from './admin-ai-labels';

export { formatAdminAiLabel } from './admin-ai-labels';

type ProviderFormValues = {
  code: string;
  name: string;
  providerType: 'openai_compatible' | 'development';
  baseUrl: string;
  credentialEnvKey: string;
  status: 'enabled' | 'disabled';
} & ProviderBillingFormValues;

type ProviderBillingFormValues = {
  billingChatEnabled: boolean;
  billingChatInputCreditsPer1k: number;
  billingChatCachedInputCreditsPer1k: number;
  billingChatCacheMissInputCreditsPer1k: number;
  billingChatOutputCreditsPer1k: number;
  billingChatMinimumCredits: number;
  billingImageEnabled: boolean;
  billingImageMode: 'fixed' | 'per_image' | 'provider_usage_tokens';
  billingImageFixedCredits: number;
  billingImageImageCredits: number;
  billingImageTokenCreditsPer1k: number;
  billingImageMinimumCredits: number;
  billingVideoEnabled: boolean;
  billingVideoMode: 'provider_usage_tokens' | 'video_seconds';
  billingVideoTokenCreditsPer1k: number;
  billingVideoSecondsCredits: number;
  billingVideoMinimumCredits: number;
  billingVideoResolutionMultipliersJson: string;
};

type ModelFormValues = {
  providerId: string;
  code: string;
  name: string;
  model: string;
  status: 'enabled' | 'disabled';
  supportsChat: boolean;
  supportsImageGeneration: boolean;
  supportsImageEdit: boolean;
  supportsImageUpscale: boolean;
  supportsVideoGeneration: boolean;
};

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await adminApiRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      typeof payload?.error?.message === 'string' ? payload.error.message : '提交失败。',
    );
  }

  return payload;
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseResolutionMultipliers(value: string) {
  const parsed = JSON.parse(value.trim() || '{}') as unknown;
  const record = readRecord(parsed);
  return Object.fromEntries(
    Object.entries(record)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      .map(([key, item]) => [key, item]),
  );
}

function BillingSection({
  title,
  description,
  enabled,
  onEnabledChange,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-neutral-950">{title}</div>
          <div className="mt-1 text-xs leading-5 text-neutral-600">{description}</div>
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      {enabled ? <div className="mt-3 grid gap-3">{children}</div> : null}
    </div>
  );
}

function BillingNumberField({
  form,
  name,
  label,
  step = '1',
}: {
  form: UseFormReturn<ProviderFormValues>;
  name: keyof ProviderBillingFormValues;
  label: string;
  step?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              min="0"
              step={step}
              value={typeof field.value === 'number' ? field.value : 0}
              onChange={(event) => field.onChange(Number(event.target.value))}
              onBlur={field.onBlur}
              name={field.name}
              ref={field.ref}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ProviderBillingRulesFields({
  form,
}: {
  form: UseFormReturn<ProviderFormValues>;
}) {
  const imageMode = form.watch('billingImageMode');
  const videoMode = form.watch('billingVideoMode');

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium text-neutral-950">计费规则</div>
        <div className="mt-1 text-xs leading-5 text-neutral-600">
          按供应商返回的用量换算积分。关闭某一类后，该供应商不会保存对应任务类型的计费规则。
        </div>
      </div>

      <FormField
        control={form.control}
        name="billingChatEnabled"
        render={({ field }) => (
          <BillingSection
            title="对话计费"
            description="适配 DeepSeek 等返回缓存命中/未命中输入 token 的模型。"
            enabled={field.value}
            onEnabledChange={field.onChange}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <BillingNumberField
                form={form}
                name="billingChatInputCreditsPer1k"
                label="普通输入 / 千 token"
                step="0.01"
              />
              <BillingNumberField
                form={form}
                name="billingChatCachedInputCreditsPer1k"
                label="缓存命中输入 / 千 token"
                step="0.01"
              />
              <BillingNumberField
                form={form}
                name="billingChatCacheMissInputCreditsPer1k"
                label="缓存未命中输入 / 千 token"
                step="0.01"
              />
              <BillingNumberField
                form={form}
                name="billingChatOutputCreditsPer1k"
                label="输出 / 千 token"
                step="0.01"
              />
              <BillingNumberField
                form={form}
                name="billingChatMinimumCredits"
                label="最低扣费积分"
                step="0.01"
              />
            </div>
          </BillingSection>
        )}
      />

      <FormField
        control={form.control}
        name="billingImageEnabled"
        render={({ field }) => (
          <BillingSection
            title="图像计费"
            description="适配固定扣费、按图片张数扣费，或按上游 token 用量扣费。"
            enabled={field.value}
            onEnabledChange={field.onChange}
          >
            <FormField
              control={form.control}
              name="billingImageMode"
              render={({ field: modeField }) => (
                <FormItem>
                  <FormLabel>计费模式</FormLabel>
                  <Select value={modeField.value} onValueChange={modeField.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="fixed">{formatAdminAiLabel('fixed')}</SelectItem>
                      <SelectItem value="per_image">{formatAdminAiLabel('per_image')}</SelectItem>
                      <SelectItem value="provider_usage_tokens">
                        {formatAdminAiLabel('provider_usage_tokens')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {imageMode === 'fixed' ? (
                <BillingNumberField
                  form={form}
                  name="billingImageFixedCredits"
                  label="固定扣费积分"
                />
              ) : null}
              {imageMode === 'per_image' ? (
                <BillingNumberField
                  form={form}
                  name="billingImageImageCredits"
                  label="每张图片积分"
                />
              ) : null}
              {imageMode === 'provider_usage_tokens' ? (
                <BillingNumberField
                  form={form}
                  name="billingImageTokenCreditsPer1k"
                  label="每千 token 积分"
                  step="0.01"
                />
              ) : null}
              <BillingNumberField
                form={form}
                name="billingImageMinimumCredits"
                label="最低扣费积分"
                step="0.01"
              />
            </div>
          </BillingSection>
        )}
      />

      <FormField
        control={form.control}
        name="billingVideoEnabled"
        render={({ field }) => (
          <BillingSection
            title="视频计费"
            description="适配 Doubao Seedance 等视频模型，可按上游 token 或视频秒数计费。"
            enabled={field.value}
            onEnabledChange={field.onChange}
          >
            <FormField
              control={form.control}
              name="billingVideoMode"
              render={({ field: modeField }) => (
                <FormItem>
                  <FormLabel>计费模式</FormLabel>
                  <Select value={modeField.value} onValueChange={modeField.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="provider_usage_tokens">
                        {formatAdminAiLabel('provider_usage_tokens')}
                      </SelectItem>
                      <SelectItem value="video_seconds">
                        {formatAdminAiLabel('video_seconds')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {videoMode === 'provider_usage_tokens' ? (
                <BillingNumberField
                  form={form}
                  name="billingVideoTokenCreditsPer1k"
                  label="每千 token 积分"
                  step="0.01"
                />
              ) : null}
              {videoMode === 'video_seconds' ? (
                <BillingNumberField
                  form={form}
                  name="billingVideoSecondsCredits"
                  label="每秒积分"
                  step="0.01"
                />
              ) : null}
              <BillingNumberField
                form={form}
                name="billingVideoMinimumCredits"
                label="最低扣费积分"
                step="0.01"
              />
            </div>
            {videoMode === 'video_seconds' ? (
              <FormField
                control={form.control}
                name="billingVideoResolutionMultipliersJson"
                render={({ field: multipliersField }) => (
                  <FormItem>
                    <FormLabel>分辨率倍率 JSON</FormLabel>
                    <FormControl>
                      <Textarea
                        {...multipliersField}
                        className="min-h-24 font-mono text-xs"
                        spellCheck={false}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
          </BillingSection>
        )}
      />
    </div>
  );
}

export function providerBillingRulesToFormValues(
  value: unknown,
): ProviderBillingFormValues {
  const rules = readRecord(value);
  const chat = readRecord(rules.chat);
  const image = readRecord(rules.image);
  const video = readRecord(rules.video);
  const imageMode =
    image.mode === 'per_image' || image.mode === 'provider_usage_tokens'
      ? image.mode
      : 'fixed';
  const videoMode = video.mode === 'video_seconds' ? video.mode : 'provider_usage_tokens';

  return {
    billingChatEnabled: Object.keys(chat).length > 0,
    billingChatInputCreditsPer1k: readNumber(chat.inputCreditsPer1k, 0),
    billingChatCachedInputCreditsPer1k: readNumber(chat.cachedInputCreditsPer1k, 0),
    billingChatCacheMissInputCreditsPer1k: readNumber(chat.cacheMissInputCreditsPer1k, 0),
    billingChatOutputCreditsPer1k: readNumber(chat.outputCreditsPer1k, 0),
    billingChatMinimumCredits: readNumber(chat.minimumCredits, 1),
    billingImageEnabled: Object.keys(image).length > 0,
    billingImageMode: imageMode,
    billingImageFixedCredits: readNumber(image.fixedCredits, 0),
    billingImageImageCredits: readNumber(image.imageCredits, 0),
    billingImageTokenCreditsPer1k: readNumber(image.tokenCreditsPer1k, 0),
    billingImageMinimumCredits: readNumber(image.minimumCredits, 1),
    billingVideoEnabled: Object.keys(video).length > 0,
    billingVideoMode: videoMode,
    billingVideoTokenCreditsPer1k: readNumber(video.tokenCreditsPer1k, 0),
    billingVideoSecondsCredits: readNumber(video.secondsCredits, 0),
    billingVideoMinimumCredits: readNumber(video.minimumCredits, 3),
    billingVideoResolutionMultipliersJson: formatJson(readRecord(video.resolutionMultipliers)),
  };
}

export function providerBillingRulesFromFormValues(
  values: ProviderBillingFormValues,
): ProviderBillingRuleConfig {
  const rules: ProviderBillingRuleConfig = {};

  if (values.billingChatEnabled) {
    rules.chat = {
      mode: 'token_breakdown',
      inputCreditsPer1k: values.billingChatInputCreditsPer1k,
      cachedInputCreditsPer1k: values.billingChatCachedInputCreditsPer1k,
      cacheMissInputCreditsPer1k: values.billingChatCacheMissInputCreditsPer1k,
      outputCreditsPer1k: values.billingChatOutputCreditsPer1k,
      minimumCredits: values.billingChatMinimumCredits,
    };
  }

  if (values.billingImageEnabled) {
    rules.image = {
      mode: values.billingImageMode,
      ...(values.billingImageMode === 'fixed'
        ? { fixedCredits: values.billingImageFixedCredits }
        : {}),
      ...(values.billingImageMode === 'per_image'
        ? { imageCredits: values.billingImageImageCredits }
        : {}),
      ...(values.billingImageMode === 'provider_usage_tokens'
        ? { tokenCreditsPer1k: values.billingImageTokenCreditsPer1k }
        : {}),
      minimumCredits: values.billingImageMinimumCredits,
    };
  }

  if (values.billingVideoEnabled) {
    const resolutionMultipliers = parseResolutionMultipliers(
      values.billingVideoResolutionMultipliersJson,
    );
    rules.video = {
      mode: values.billingVideoMode,
      ...(values.billingVideoMode === 'provider_usage_tokens'
        ? { tokenCreditsPer1k: values.billingVideoTokenCreditsPer1k }
        : {}),
      ...(values.billingVideoMode === 'video_seconds'
        ? { secondsCredits: values.billingVideoSecondsCredits }
        : {}),
      ...(Object.keys(resolutionMultipliers).length > 0 ? { resolutionMultipliers } : {}),
      minimumCredits: values.billingVideoMinimumCredits,
    };
  }

  return rules;
}

function ProviderDialog({
  trigger,
  triggerTooltip,
  title,
  description,
  submitLabel,
  submitUrl,
  initialValues,
}: {
  trigger: React.ReactNode;
  triggerTooltip?: string;
  title: string;
  description: string;
  submitLabel: string;
  submitUrl: string;
  initialValues: ProviderFormValues;
}) {
  const router = useRouter();
  const form = useForm<ProviderFormValues>({
    defaultValues: initialValues,
  });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmitting = form.formState.isSubmitting;

  useEffect(() => {
    form.reset(initialValues);
  }, [form, initialValues, open]);

  async function onSubmit(values: ProviderFormValues) {
    setError(null);
    try {
      const billingRules = providerBillingRulesFromFormValues(values);

      await postJson(submitUrl, {
        code: values.code,
        name: values.name,
        providerType: values.providerType,
        status: values.status,
        baseUrl: values.baseUrl.trim() || null,
        credentialEnvKey: values.credentialEnvKey.trim() || null,
        billingRules,
      });
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof SyntaxError
          ? '分辨率倍率 JSON 格式无效。'
          : submitError instanceof Error
            ? submitError.message
            : '提交失败。',
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {triggerTooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                rules={{ required: '请输入供应商编码。' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>编码</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="siliconflow" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                rules={{ required: '请输入供应商名称。' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="SiliconFlow" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="providerType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>类型</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="openai_compatible">
                          {formatAdminAiLabel('openai_compatible')}
                        </SelectItem>
                        <SelectItem value="development">
                          {formatAdminAiLabel('development')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>状态</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="disabled">
                          {formatAdminAiLabel('disabled')}
                        </SelectItem>
                        <SelectItem value="enabled">
                          {formatAdminAiLabel('enabled')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="baseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>接口地址</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://api.example.com/v1" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="credentialEnvKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>凭据环境变量</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="OPENAI_API_KEY" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <ProviderBillingRulesFields form={form} />

            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ModelDialog({
  trigger,
  triggerTooltip,
  title,
  description,
  submitLabel,
  submitUrl,
  providers,
  initialValues,
}: {
  trigger: React.ReactNode;
  triggerTooltip?: string;
  title: string;
  description: string;
  submitLabel: string;
  submitUrl: string;
  providers: AdminAiProviderRow[];
  initialValues: ModelFormValues;
}) {
  const router = useRouter();
  const enabledProviders = useMemo(
    () => providers.filter((provider) => provider.status !== 'archived'),
    [providers],
  );
  const form = useForm<ModelFormValues>({
    defaultValues: initialValues,
  });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmitting = form.formState.isSubmitting;

  useEffect(() => {
    form.reset(initialValues);
  }, [form, initialValues, open]);

  async function onSubmit(values: ModelFormValues) {
    setError(null);
    try {
      await postJson(submitUrl, values);
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '提交失败。');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {triggerTooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="providerId"
              rules={{ required: '请选择供应商。' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>供应商</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="选择供应商" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {enabledProviders.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                rules={{ required: '请输入模型编码。' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>编码</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="sf-deepseek-v3" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                rules={{ required: '请输入模型名称。' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="DeepSeek V3" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="model"
              rules={{ required: '请输入上游模型标识。' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>上游模型名</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="deepseek-chat" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>状态</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="disabled">
                          {formatAdminAiLabel('disabled')}
                        </SelectItem>
                        <SelectItem value="enabled">
                          {formatAdminAiLabel('enabled')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supportsChat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>支持对话</FormLabel>
                    <FormControl>
                      <div className="flex h-9 items-center rounded-md border border-neutral-200 px-3">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="supportsImageGeneration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>图像生成</FormLabel>
                    <FormControl>
                      <div className="flex h-9 items-center rounded-md border border-neutral-200 px-3">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supportsImageEdit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>图像编辑</FormLabel>
                    <FormControl>
                      <div className="flex h-9 items-center rounded-md border border-neutral-200 px-3">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supportsImageUpscale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>图像放大</FormLabel>
                    <FormControl>
                      <div className="flex h-9 items-center rounded-md border border-neutral-200 px-3">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supportsVideoGeneration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>视频生成</FormLabel>
                    <FormControl>
                      <div className="flex h-9 items-center rounded-md border border-neutral-200 px-3">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function CreateAiProviderDialog() {
  return (
    <ProviderDialog
      trigger={
        <Button type="button" size="sm">
          <Plus className="h-4 w-4" />
          新增供应商
        </Button>
      }
      title="新增供应商"
      description="录入 OpenAI 兼容接口地址、凭据环境变量引用与供应商计费规则。"
      submitLabel="保存供应商"
      submitUrl="/api/admin/ai-providers"
      initialValues={{
        code: '',
        name: '',
        providerType: 'openai_compatible',
        baseUrl: '',
        credentialEnvKey: '',
        status: 'disabled',
        ...providerBillingRulesToFormValues({}),
      }}
    />
  );
}

export function EditAiProviderDialog({
  provider,
  compact = false,
}: {
  provider: AdminAiProviderRow;
  compact?: boolean;
}) {
  const trigger = (
    <Button
      type="button"
      size={compact ? 'icon-sm' : 'sm'}
      variant="outline"
      title="编辑供应商"
      aria-label="编辑供应商"
    >
      <Pencil className="h-3.5 w-3.5" />
      {compact ? null : '编辑'}
    </Button>
  );

  return (
    <ProviderDialog
      trigger={trigger}
      triggerTooltip={compact ? '编辑供应商' : undefined}
      title="编辑供应商"
      description="更新接口地址、凭据引用、状态与供应商计费规则。"
      submitLabel="保存修改"
      submitUrl={`/api/admin/ai-providers/${provider.id}`}
      initialValues={{
        code: provider.code,
        name: provider.name,
        providerType: provider.providerType,
        baseUrl: provider.baseUrlLabel === 'not configured' ? '' : provider.baseUrlLabel,
        credentialEnvKey: provider.credential.label === 'not required' ? '' : provider.credential.label,
        status: provider.status === 'archived' ? 'disabled' : provider.status,
        ...providerBillingRulesToFormValues(provider.billingRules),
      }}
    />
  );
}

export function CreateAiModelDialog({
  providers,
}: {
  providers: AdminAiProviderRow[];
}) {
  const firstProviderId =
    providers.find((provider) => provider.status !== 'archived')?.id ?? '';

  return (
    <ModelDialog
      trigger={
        <Button type="button" size="sm" variant="outline">
          <Plus className="h-4 w-4" />
          新增模型
        </Button>
      }
      title="新增模型"
      description="绑定供应商、上游模型名与对话、图像、视频能力。"
      submitLabel="保存模型"
      submitUrl="/api/admin/ai-models"
      providers={providers}
      initialValues={{
        providerId: firstProviderId,
        code: '',
        name: '',
        model: '',
        status: 'disabled',
        supportsChat: true,
        supportsImageGeneration: false,
        supportsImageEdit: false,
        supportsImageUpscale: false,
        supportsVideoGeneration: false,
      }}
    />
  );
}

export function EditAiModelDialog({
  model,
  providers,
  compact = false,
}: {
  model: AdminAiModelRow;
  providers: AdminAiProviderRow[];
  compact?: boolean;
}) {
  const trigger = (
    <Button
      type="button"
      size={compact ? 'icon-sm' : 'sm'}
      variant="outline"
      title="编辑模型"
      aria-label="编辑模型"
    >
      <Pencil className="h-3.5 w-3.5" />
      {compact ? null : '编辑'}
    </Button>
  );

  return (
    <ModelDialog
      trigger={trigger}
      triggerTooltip={compact ? '编辑模型' : undefined}
      title="编辑模型"
      description="更新供应商绑定、上游模型标识和对话、图像、视频能力。"
      submitLabel="保存修改"
      submitUrl={`/api/admin/ai-models/${model.id}`}
      providers={providers}
      initialValues={{
        providerId: model.providerId,
        code: model.code,
        name: model.name,
        model: model.model,
        status: model.status === 'archived' ? 'disabled' : model.status,
        supportsChat: model.supportsChat,
        supportsImageGeneration: model.supportsImageGeneration,
        supportsImageEdit: model.supportsImageEdit,
        supportsImageUpscale: model.supportsImageUpscale,
        supportsVideoGeneration: model.supportsVideoGeneration,
      }}
    />
  );
}

export function AdminAiModelQuickSummary({
  model,
}: {
  model: AdminAiModelRow;
}) {
  return (
    <div className="space-y-1 text-xs text-neutral-600">
      <div>{model.providerName}</div>
      <div>{model.model}</div>
      <div>{model.pricingSummary}</div>
    </div>
  );
}
