'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
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

type ProviderFormValues = {
  code: string;
  name: string;
  providerType: 'openai_compatible' | 'development';
  baseUrl: string;
  credentialEnvKey: string;
  status: 'enabled' | 'disabled';
};

type ModelFormValues = {
  providerId: string;
  code: string;
  name: string;
  model: string;
  status: 'enabled' | 'disabled';
  supportsChat: boolean;
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

function ProviderDialog({
  trigger,
  title,
  description,
  submitLabel,
  submitUrl,
  initialValues,
}: {
  trigger: React.ReactNode;
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
      await postJson(submitUrl, {
        ...values,
        baseUrl: values.baseUrl.trim() || null,
        credentialEnvKey: values.credentialEnvKey.trim() || null,
      });
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '提交失败。');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
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
                rules={{ required: '请输入 provider code。' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
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
                        <SelectItem value="openai_compatible">openai_compatible</SelectItem>
                        <SelectItem value="development">development</SelectItem>
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
                        <SelectItem value="disabled">disabled</SelectItem>
                        <SelectItem value="enabled">enabled</SelectItem>
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
                  <FormLabel>Base URL</FormLabel>
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
                  <FormLabel>Credential Env Key</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="OPENAI_API_KEY" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
  title,
  description,
  submitLabel,
  submitUrl,
  providers,
  initialValues,
}: {
  trigger: React.ReactNode;
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
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
                rules={{ required: '请输入模型 code。' }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
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
                        <SelectItem value="disabled">disabled</SelectItem>
                        <SelectItem value="enabled">enabled</SelectItem>
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
                    <FormLabel>支持 Chat</FormLabel>
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
      description="录入 OpenAI-compatible endpoint 与凭据环境变量引用。"
      submitLabel="保存供应商"
      submitUrl="/api/admin/ai-providers"
      initialValues={{
        code: '',
        name: '',
        providerType: 'openai_compatible',
        baseUrl: '',
        credentialEnvKey: '',
        status: 'disabled',
      }}
    />
  );
}

export function EditAiProviderDialog({
  provider,
}: {
  provider: AdminAiProviderRow;
}) {
  return (
    <ProviderDialog
      trigger={
        <Button type="button" size="sm" variant="outline">
          <Pencil className="h-3.5 w-3.5" />
          编辑
        </Button>
      }
      title="编辑供应商"
      description="更新 endpoint、凭据引用和状态。"
      submitLabel="保存修改"
      submitUrl={`/api/admin/ai-providers/${provider.id}`}
      initialValues={{
        code: provider.code,
        name: provider.name,
        providerType: provider.providerType,
        baseUrl: provider.baseUrlLabel === 'not configured' ? '' : provider.baseUrlLabel,
        credentialEnvKey: provider.credential.label === 'not required' ? '' : provider.credential.label,
        status: provider.status === 'archived' ? 'disabled' : provider.status,
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
      description="绑定供应商、模型名与 chat 能力。"
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
      }}
    />
  );
}

export function EditAiModelDialog({
  model,
  providers,
}: {
  model: AdminAiModelRow;
  providers: AdminAiProviderRow[];
}) {
  return (
    <ModelDialog
      trigger={
        <Button type="button" size="sm" variant="outline">
          <Pencil className="h-3.5 w-3.5" />
          编辑
        </Button>
      }
      title="编辑模型"
      description="更新供应商绑定、模型标识和 chat 状态。"
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
