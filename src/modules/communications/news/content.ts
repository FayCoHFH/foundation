import { canonicalValueHash } from "@/modules/publishing/hash";
import { ValidationError } from "@/platform/errors/app-error";

export const NEWS_BODY_SCHEMA_VERSION = 1;
export const NEWS_CONTENT_HASH_VERSION = 1;
export type NewsDocument = Readonly<{
  schemaVersion: number;
  root: Readonly<Record<string, unknown>>;
}>;
export type NewsCandidate = Readonly<{
  headline: string;
  summary: string;
  body: NewsDocument;
  expiresAt: Date | null;
}>;

function fail(message: string): never {
  throw new ValidationError(message);
}
function record(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}
function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    fail(`${label} contains an unsupported attribute.`);
}
function text(value: unknown) {
  if (
    !record(value) ||
    value.type !== "text" ||
    typeof value.text !== "string" ||
    !value.text.trim()
  )
    fail("News body text must use a non-empty supported text node.");
  keys(value, ["type", "text", "marks"], "News body text");
  if (value.text.length > 30_000) fail("News body text is too long.");
  if (value.marks === undefined) return;
  if (!Array.isArray(value.marks)) fail("News body marks must be an array.");
  for (const mark of value.marks) {
    if (!record(mark) || typeof mark.type !== "string")
      fail("News body contains an invalid mark.");
    if (mark.type === "strong" || mark.type === "emphasis") {
      keys(mark, ["type"], "News body mark");
      continue;
    }
    if (mark.type !== "link") fail("News body contains an unsupported mark.");
    keys(mark, ["type", "attrs"], "News body link");
    if (!record(mark.attrs) || typeof mark.attrs.href !== "string")
      fail("News body links require a destination.");
    let url: URL;
    try {
      url = new URL(mark.attrs.href);
    } catch {
      fail("News body links must use an absolute approved URL.");
    }
    if (!["https:", "mailto:", "tel:"].includes(url.protocol))
      fail("News body links use an unsupported protocol.");
  }
}
function inline(value: unknown, label: string) {
  if (!Array.isArray(value) || !value.length)
    fail(`${label} requires text content.`);
  value.forEach(text);
}
function block(value: unknown): void {
  if (!record(value) || typeof value.type !== "string")
    fail("News body contains an invalid node.");
  if (value.type === "paragraph") {
    keys(value, ["type", "content"], "News paragraph");
    inline(value.content, "News paragraph");
    return;
  }
  if (value.type === "heading") {
    keys(value, ["type", "attrs", "content"], "News heading");
    if (!record(value.attrs) || value.attrs.level !== 2)
      fail("News headings are limited to level 2.");
    keys(value.attrs, ["level"], "News heading attributes");
    inline(value.content, "News heading");
    return;
  }
  if (value.type === "bulletList" || value.type === "orderedList") {
    keys(value, ["type", "content"], "News list");
    if (!Array.isArray(value.content) || !value.content.length)
      fail("News lists require items.");
    for (const item of value.content) {
      if (!record(item) || item.type !== "listItem")
        fail("News lists may contain only list items.");
      keys(item, ["type", "content"], "News list item");
      if (!Array.isArray(item.content) || !item.content.length)
        fail("News list items require content.");
      item.content.forEach(block);
    }
    return;
  }
  fail("News body contains an unsupported node.");
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function validateNewsDocument(value: unknown): NewsDocument {
  if (!record(value)) fail("News body must be a structured document.");
  keys(value, ["schemaVersion", "root"], "News body");
  if (
    value.schemaVersion !== NEWS_BODY_SCHEMA_VERSION ||
    !record(value.root) ||
    value.root.type !== "doc"
  )
    fail("News body must use the supported document schema.");
  keys(value.root, ["type", "content"], "News document root");
  if (!Array.isArray(value.root.content) || !value.root.content.length)
    fail("News body requires at least one block.");
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 100_000)
    fail("News body exceeds the supported size.");
  value.root.content.forEach(block);
  return freeze(structuredClone(value) as NewsDocument);
}
export function newsDocumentFromPlainText(value: string): NewsDocument {
  const paragraphs = value
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!paragraphs.length) fail("Enter News body text.");
  return validateNewsDocument({
    schemaVersion: 1,
    root: {
      type: "doc",
      content: paragraphs.map((item) => ({
        type: "paragraph",
        content: [{ type: "text", text: item }],
      })),
    },
  });
}
export function validateNewsCandidate(value: NewsCandidate): NewsCandidate {
  const headline = value.headline.trim(),
    summary = value.summary.trim();
  if (!headline || headline.length > 180)
    fail("News headline must contain between 1 and 180 characters.");
  if (!summary || summary.length > 600)
    fail("News summary must contain between 1 and 600 characters.");
  if (value.expiresAt && Number.isNaN(value.expiresAt.valueOf()))
    fail("News expiration must be a valid date.");
  return freeze({
    headline,
    summary,
    body: validateNewsDocument(value.body),
    expiresAt: value.expiresAt,
  });
}
export function hashNewsCandidate(value: NewsCandidate): string {
  const candidate = validateNewsCandidate(value);
  return canonicalValueHash({
    kind: "NEWS",
    headline: candidate.headline,
    summary: candidate.summary,
    body: candidate.body,
    schemaVersion: candidate.body.schemaVersion,
    expiresAt: candidate.expiresAt?.toISOString() ?? null,
  });
}
export function newsDocumentToPlainText(document: NewsDocument): string {
  const values: string[] = [];
  const walk = (value: unknown) => {
    if (!record(value)) return;
    if (value.type === "text" && typeof value.text === "string")
      values.push(value.text);
    if (Array.isArray(value.content)) value.content.forEach(walk);
    if (value.type === "paragraph" || value.type === "heading")
      values.push("\n");
  };
  walk(document.root);
  return values
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
