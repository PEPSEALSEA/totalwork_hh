import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

export function MarkdownText({ text, className = "" }: { text: string; className?: string }) {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\\n/g, "\n");

  return <div className={`markdown-text ${className}`.trim()}><ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{normalized}</ReactMarkdown></div>;
}
