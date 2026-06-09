export function supportsStoryboardTemplateProvider(input: {
  providerCode?: string | null;
  providerName?: string | null;
  baseUrl?: string | null;
  model?: string | null;
}) {
  const providerCode = input.providerCode?.trim().toLowerCase() ?? '';
  const providerName = input.providerName?.trim().toLowerCase() ?? '';
  const baseUrl = input.baseUrl?.trim().toLowerCase() ?? '';
  const model = input.model?.trim().toLowerCase() ?? '';

  return (
    providerCode === 'openai' ||
    providerCode.startsWith('openai') ||
    providerName.includes('openai') ||
    baseUrl.includes('api.openai.com') ||
    model.startsWith('gpt-image-')
  );
}
