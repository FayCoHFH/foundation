import type { ReactNode } from "react";

export type StoryNode = {
  type?: string;
  text?: string;
  attrs?: { href?: string; level?: number };
  marks?: Array<{ type?: string; attrs?: { href?: string } }>;
  content?: StoryNode[];
};

function InlineText({ node }: { node: StoryNode }) {
  let content: ReactNode = node.text ?? null;
  for (const mark of node.marks ?? []) {
    if (mark.type === "strong") content = <strong>{content}</strong>;
    if (mark.type === "emphasis") content = <em>{content}</em>;
    if (mark.type === "link" && mark.attrs?.href) {
      content = (
        <a
          className="text-primary font-semibold underline"
          href={mark.attrs.href}
        >
          {content}
        </a>
      );
    }
  }
  return content;
}

export function StoryBody({ node }: { node: StoryNode }) {
  if (node.type === "text") return <InlineText node={node} />;
  const children = node.content?.map((child, index) => (
    <StoryBody key={index} node={child} />
  ));
  switch (node.type) {
    case "paragraph":
      return (
        <p className="text-foreground type-article-body mt-6 text-[1.125rem] leading-[1.82] sm:text-[1.2rem]">
          {children}
        </p>
      );
    case "heading":
      return node.attrs?.level === 3 ? (
        <h3 className="text-brand-black type-display mt-10 text-3xl leading-tight font-semibold">
          {children}
        </h3>
      ) : (
        <h2 className="text-brand-black type-display mt-14 text-4xl leading-[1.08] font-semibold sm:text-5xl">
          {children}
        </h2>
      );
    case "blockquote":
      return (
        <blockquote className="border-brand-orange text-brand-black type-quote mt-10 border-l-2 py-1 pl-6 text-3xl leading-snug sm:text-4xl">
          {children}
        </blockquote>
      );
    case "bulletList":
      return (
        <ul className="marker:text-primary mt-7 space-y-3 pl-5 text-[1.125rem] leading-8">
          {children}
        </ul>
      );
    case "orderedList":
      return (
        <ol className="marker:text-primary mt-7 list-decimal space-y-3 pl-6 text-[1.125rem] leading-8 marker:font-semibold">
          {children}
        </ol>
      );
    case "listItem":
      return <li>{children}</li>;
    default:
      return <>{children}</>;
  }
}
