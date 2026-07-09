import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "@/components/CodeBlock";

/**
 * Render de markdown del contenido del curso (C-CONTENT: `contenidoMd`).
 *
 * Seguro por construcción: sin `rehype-raw`, react-markdown NUNCA interpreta
 * HTML embebido en el markdown como elementos reales (se escapa como texto).
 * Los bloques de código (```lang ... ```) se delegan a `CodeBlock` (CA-29).
 */

const components: Components = {
  code({ className, children, ...rest }) {
    const match = /language-(\w+)/.exec(className ?? "");
    if (match) {
      const raw = String(children).replace(/\n$/, "");
      return <CodeBlock code={raw} language={match[1]} />;
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
  h1: (props) => <h1 className="mt-6 text-xl font-bold" {...props} />,
  h2: (props) => <h2 className="mt-6 text-lg font-semibold" {...props} />,
  h3: (props) => <h3 className="mt-4 text-base font-semibold" {...props} />,
  p: (props) => <p className="mt-3 leading-relaxed" {...props} />,
  ul: (props) => <ul className="mt-3 list-disc space-y-1 pl-5" {...props} />,
  ol: (props) => <ol className="mt-3 list-decimal space-y-1 pl-5" {...props} />,
  a: (props) => (
    <a className="text-primary underline underline-offset-2" {...props} />
  ),
  strong: (props) => <strong className="font-semibold" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="mt-3 border-l-2 border-border pl-3 text-muted-foreground"
      {...props}
    />
  ),
};

export interface MarkdownViewProps {
  contenidoMd: string;
}

export function MarkdownView({ contenidoMd }: MarkdownViewProps) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {contenidoMd}
      </ReactMarkdown>
    </div>
  );
}
