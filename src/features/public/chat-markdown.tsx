import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ChatMarkdownProps = {
  content: string;
};

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, ...props }) => (
          <a
            {...props}
            className="font-medium text-[#1d4ed8] underline underline-offset-2"
            rel="noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
        code: ({ children, className, ...props }) => (
          <code
            {...props}
            className={`rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[0.92em] ${className ?? ''}`}
          >
            {children}
          </code>
        ),
        pre: ({ children, ...props }) => (
          <pre
            {...props}
            className="my-3 overflow-x-auto rounded-lg bg-[#1d1d1f] p-3 text-xs leading-5 text-white"
          >
            {children}
          </pre>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
