import { AdminAiModelsModule } from '@/features/admin/admin-ai-models-module';
import {
  CreateAiModelDialog,
  CreateAiProviderDialog,
} from '@/features/admin/admin-ai-config-forms';
import { AdminModuleGuide } from '@/features/admin/admin-module-guide';
import {
  getAdminAiModels,
} from '@/server/repositories/ai-models';

export const dynamic = 'force-dynamic';

export default async function AdminAiModelsPage() {
  const data = await getAdminAiModels();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <CreateAiProviderDialog />
        <CreateAiModelDialog providers={data.providers} />
      </div>

      <AdminModuleGuide
        title="第一次配置 AI 模型"
        description="AI 模型配置以供应商为上游入口，模型能力决定用户端对话、图像、视频可选项；计费规则只在管理端维护，用于把上游 token、图片或视频用量换算成积分扣费。"
        steps={[
          '先新增或编辑供应商，确认接口地址、凭据环境变量和计费规则已配置。',
          '再新增模型并绑定供应商，按真实上游能力打开对话、图像生成、图像编辑、图像放大或视频生成开关。',
          '启用模型前执行配置测试，确认凭据、上游模型名和默认模型选择都能正常工作。',
        ]}
        risks={[
          '启用供应商时必须有可用接口地址和凭据引用，否则真实调用会失败。',
          '计费规则配置错误会影响积分扣费结果，调整后先用小流量模型验证。',
          '视频模型需要同时打开视频生成能力，并确认供应商侧已支持异步任务查询。',
        ]}
      />

      <AdminAiModelsModule
        source={data.source}
        metrics={data.metrics}
        filters={data.filters}
        records={data.records}
        providers={data.providers}
      />
    </div>
  );
}
