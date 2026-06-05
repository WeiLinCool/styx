import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { ChatMarkdown } from './chat-markdown';
import { DocsNavigation, type DocsNavItem } from './docs-navigation';
import type { DocBlock } from '@/server/docs/schema';

function renderRichText(block: Extract<DocBlock, { type: 'rich_text' }>) {
  const lines = block.content
    .map((node) => {
      if (Array.isArray(node.content)) {
        return node.content
          .map((child) => ('text' in child && typeof child.text === 'string' ? child.text : ''))
          .join(' ');
      }
      return typeof node.text === 'string' ? node.text : '';
    })
    .filter(Boolean)
    .join('\n\n');

  return <ChatMarkdown content={lines} />;
}

function DocBlockView({ block }: { block: DocBlock }) {
  if (block.type === 'rich_text') {
    return <section className="prose prose-stone max-w-none text-sm leading-7">{renderRichText(block)}</section>;
  }

  if (block.type === 'step_media') {
    return (
      <section className="space-y-4 rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold text-stone-950">分步骤图文</div>
        <div className="grid gap-4">
          {block.steps.map((step, index) => (
            <div key={`${step.title}-${index}`} className="grid gap-4 rounded-3xl bg-stone-50 p-4 md:grid-cols-[auto_1fr]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white">
                {index + 1}
              </div>
              <div className="space-y-2">
                <div className="text-base font-semibold text-stone-950">{step.title}</div>
                <div className="text-sm leading-7 text-stone-600">{step.body}</div>
                {step.imageUrl ? (
                  <img src={step.imageUrl} alt={step.title} className="rounded-2xl border border-stone-200 object-cover" />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (block.type === 'video') {
    return (
      <section className="space-y-3 rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold text-stone-950">{block.title}</div>
        <video controls poster={block.coverImage} className="w-full rounded-3xl border border-stone-200 bg-stone-950">
          <source src={block.url} />
        </video>
        {block.description ? <p className="text-sm leading-7 text-stone-600">{block.description}</p> : null}
      </section>
    );
  }

  if (block.type === 'audio') {
    return (
      <section className="space-y-3 rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="text-lg font-semibold text-stone-950">{block.title}</div>
        <audio controls className="w-full">
          <source src={block.url} />
        </audio>
        {block.description ? <p className="text-sm leading-7 text-stone-600">{block.description}</p> : null}
      </section>
    );
  }

  if (block.type === 'faq') {
    return (
      <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-4 text-lg font-semibold text-stone-950">常见问题</div>
        <Accordion type="single" collapsible>
          {block.items.map((item, index) => (
            <AccordionItem key={`${item.question}-${index}`} value={`${index}`}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>
                <div className="text-sm leading-7 text-stone-600">{item.answer}</div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    );
  }

  if (block.type === 'flowchart') {
    return (
      <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-4 text-lg font-semibold text-stone-950">流程图</div>
        <pre className="overflow-x-auto rounded-3xl bg-stone-950 p-4 text-xs leading-6 text-stone-100">
          {block.source}
        </pre>
      </section>
    );
  }

  return (
    <section className="rounded-[1.75rem] border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-4 text-lg font-semibold text-stone-950">截图轮播</div>
      <Carousel className="px-12">
        <CarouselContent>
          {block.items.map((item, index) => (
            <CarouselItem key={`${item.imageUrl}-${index}`}>
              <Card className="gap-0 rounded-[1.75rem] border-stone-200 py-0">
                <CardContent className="space-y-3 px-4 py-4">
                  <img src={item.imageUrl} alt={item.title || `gallery-${index + 1}`} className="rounded-3xl border border-stone-200 object-cover" />
                  <div>
                    <div className="text-sm font-semibold text-stone-950">{item.title || `截图 ${index + 1}`}</div>
                    <div className="text-sm leading-6 text-stone-600">{item.description || '无说明'}</div>
                  </div>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-2" />
        <CarouselNext className="right-2" />
      </Carousel>
    </section>
  );
}

export function DocsArticlePage({
  navigationItems,
  article,
}: {
  navigationItems: DocsNavItem[];
  article: {
    categoryName: string;
    categorySlug: string;
    title: string;
    summary: string;
    coverImage: string | null;
    blocks: DocBlock[];
  };
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_28%),linear-gradient(180deg,_#f7f4ec_0%,_#efe8dc_50%,_#e9dfcf_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 lg:flex-row lg:px-6">
        <div className="lg:w-80">
          <DocsNavigation
            items={navigationItems}
            activeCategorySlug={article.categorySlug}
            activeArticleSlug={navigationItems.find((item) => item.title === article.title)?.articleSlug}
          />
        </div>
        <main className="min-w-0 flex-1 space-y-6">
          <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white/85 shadow-sm backdrop-blur">
            {article.coverImage ? (
              <img src={article.coverImage} alt={article.title} className="h-72 w-full object-cover" />
            ) : null}
            <div className="space-y-4 p-8">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
                {article.categoryName}
              </div>
              <h1 className="text-4xl font-semibold tracking-tight text-stone-950">{article.title}</h1>
              <p className="max-w-3xl text-sm leading-7 text-stone-600">{article.summary || '暂无摘要'}</p>
            </div>
          </section>
          <div className="space-y-5">
            {article.blocks.map((block, index) => (
              <DocBlockView key={`${block.type}-${index}`} block={block} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
