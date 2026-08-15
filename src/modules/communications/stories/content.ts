import { canonicalValueHash } from "@/modules/publishing/hash";
import { ValidationError } from "@/platform/errors/app-error";

export const STORY_BODY_SCHEMA_VERSION = 1;
export const STORY_CONTENT_HASH_VERSION = 1;

export type StoryDocument = Readonly<{
  schemaVersion: number;
  root: Readonly<Record<string, unknown>>;
}>;

export type StoryCandidate = Readonly<{
  headline: string;
  deck: string | null;
  excerpt: string;
  body: StoryDocument;
}>;

const MAX_DOCUMENT_BYTES = 100_000;
const MAX_TEXT_LENGTH = 30_000;
const permittedLinkProtocols = new Set(["https:", "mailto:", "tel:"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function reject(message: string): never {
  throw new ValidationError(message);
}

function allowedKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
) {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    reject(`${label} contains an unsupported attribute.`);
  }
}

function assertTextNode(value: unknown) {
  if (!isPlainRecord(value) || value.type !== "text") {
    reject("Story body text must use a supported text node.");
  }
  allowedKeys(value, ["type", "text", "marks"], "Story body text");
  if (typeof value.text !== "string" || value.text.length === 0) {
    reject("Story body text cannot be empty.");
  }
  if (value.text.length > MAX_TEXT_LENGTH) {
    reject("Story body text is too long.");
  }
  if (value.marks === undefined) return;
  if (!Array.isArray(value.marks)) {
    reject("Story body marks must be an array.");
  }
  for (const mark of value.marks) {
    if (!isPlainRecord(mark) || typeof mark.type !== "string") {
      reject("Story body contains an invalid mark.");
    }
    if (mark.type === "strong" || mark.type === "emphasis") {
      allowedKeys(mark, ["type"], "Story body mark");
      continue;
    }
    if (mark.type !== "link") {
      reject("Story body contains an unsupported mark.");
    }
    allowedKeys(mark, ["type", "attrs"], "Story body link");
    if (!isPlainRecord(mark.attrs) || typeof mark.attrs.href !== "string") {
      reject("Story body links require a destination.");
    }
    let parsed: URL;
    try {
      parsed = new URL(mark.attrs.href);
    } catch {
      reject("Story body links must use an absolute approved URL.");
    }
    if (!permittedLinkProtocols.has(parsed.protocol)) {
      reject("Story body links use an unsupported protocol.");
    }
  }
}

function assertInlineContent(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length === 0) {
    reject(`${label} requires text content.`);
  }
  for (const child of value) assertTextNode(child);
}

function assertBlockNode(value: unknown): void {
  if (!isPlainRecord(value) || typeof value.type !== "string") {
    reject("Story body contains an invalid node.");
  }
  switch (value.type) {
    case "paragraph":
      allowedKeys(value, ["type", "content"], "Story paragraph");
      assertInlineContent(value.content, "Story paragraph");
      return;
    case "heading": {
      allowedKeys(value, ["type", "attrs", "content"], "Story heading");
      if (
        !isPlainRecord(value.attrs) ||
        (value.attrs.level !== 2 && value.attrs.level !== 3)
      ) {
        reject("Story headings are limited to levels 2 and 3.");
      }
      allowedKeys(value.attrs, ["level"], "Story heading attributes");
      assertInlineContent(value.content, "Story heading");
      return;
    }
    case "blockquote":
      allowedKeys(value, ["type", "content"], "Story block quote");
      if (!Array.isArray(value.content) || value.content.length === 0) {
        reject("Story block quotes require content.");
      }
      for (const child of value.content) assertBlockNode(child);
      return;
    case "bulletList":
    case "orderedList":
      allowedKeys(value, ["type", "content"], "Story list");
      if (!Array.isArray(value.content) || value.content.length === 0) {
        reject("Story lists require at least one item.");
      }
      for (const child of value.content) {
        if (!isPlainRecord(child) || child.type !== "listItem") {
          reject("Story lists may contain only list items.");
        }
        allowedKeys(child, ["type", "content"], "Story list item");
        if (!Array.isArray(child.content) || child.content.length === 0) {
          reject("Story list items require content.");
        }
        for (const nested of child.content) assertBlockNode(nested);
      }
      return;
    default:
      reject("Story body contains an unsupported node.");
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function validateStoryDocument(value: unknown): StoryDocument {
  if (!isPlainRecord(value))
    reject("Story body must be a structured document.");
  allowedKeys(value, ["schemaVersion", "root"], "Story body");
  if (value.schemaVersion !== STORY_BODY_SCHEMA_VERSION) {
    reject(`Story body schema version must be ${STORY_BODY_SCHEMA_VERSION}.`);
  }
  if (!isPlainRecord(value.root) || value.root.type !== "doc") {
    reject("Story body must have a document root.");
  }
  allowedKeys(value.root, ["type", "content"], "Story document root");
  if (!Array.isArray(value.root.content) || value.root.content.length === 0) {
    reject("Story body requires at least one block.");
  }
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_DOCUMENT_BYTES) {
    reject("Story body exceeds the supported size.");
  }
  for (const node of value.root.content) assertBlockNode(node);
  return deepFreeze(structuredClone(value) as StoryDocument);
}

export function storyDocumentFromPlainText(value: string): StoryDocument {
  const paragraphs = value
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    reject("Enter Story body text.");
  }
  return validateStoryDocument({
    schemaVersion: STORY_BODY_SCHEMA_VERSION,
    root: {
      type: "doc",
      content: paragraphs.map((text) => ({
        type: "paragraph",
        content: [{ type: "text", text }],
      })),
    },
  });
}

export function storyDocumentToPlainText(document: StoryDocument): string {
  const text: string[] = [];
  const walk = (value: unknown) => {
    if (!isPlainRecord(value)) return;
    if (value.type === "text" && typeof value.text === "string") {
      text.push(value.text);
      return;
    }
    if (Array.isArray(value.content)) {
      for (const child of value.content) walk(child);
      if (value.type === "paragraph" || value.type === "heading")
        text.push("\n");
    }
  };
  walk(document.root);
  return text
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function validateStoryCandidate(value: StoryCandidate): StoryCandidate {
  const headline = value.headline.trim();
  const deck = value.deck?.trim() || null;
  const excerpt = value.excerpt.trim();
  if (headline.length === 0 || headline.length > 180) {
    reject("Story title must contain between 1 and 180 characters.");
  }
  if (deck !== null && deck.length > 300) {
    reject("Story deck must contain 300 characters or fewer.");
  }
  if (excerpt.length === 0 || excerpt.length > 600) {
    reject("Story excerpt must contain between 1 and 600 characters.");
  }
  return deepFreeze({
    headline,
    deck,
    excerpt,
    body: validateStoryDocument(value.body),
  });
}

/** Hash v1 deliberately excludes IDs, timestamps, actors, workflow, and audit metadata. */
export function hashStoryCandidate(candidate: StoryCandidate): string {
  const validated = validateStoryCandidate(candidate);
  return canonicalValueHash({
    kind: "STORY",
    headline: validated.headline,
    deck: validated.deck,
    excerpt: validated.excerpt,
    schemaVersion: validated.body.schemaVersion,
    body: validated.body,
  });
}
