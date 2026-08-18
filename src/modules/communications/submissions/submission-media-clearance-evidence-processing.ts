import "server-only";

import { createRequire } from "node:module";
import decodeHeic from "heic-decode";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp, { type Sharp } from "sharp";

import {
  type PublicStorySubmissionMediaClearanceEvidenceFormat,
  type PublicStorySubmissionMediaClearanceEvidenceRejectionReason,
} from "@/generated/prisma/client";

import {
  CLEARANCE_EVIDENCE_MAX_HEIGHT,
  CLEARANCE_EVIDENCE_MAX_IMAGE_BYTES,
  CLEARANCE_EVIDENCE_MAX_PDF_BYTES,
  CLEARANCE_EVIDENCE_MAX_PDF_PAGES,
  CLEARANCE_EVIDENCE_MAX_PIXELS,
  CLEARANCE_EVIDENCE_MAX_WIDTH,
  CLEARANCE_EVIDENCE_REVIEW_MAX_EDGE,
  type ClearanceEvidenceMimeType,
} from "./submission-media-clearance-evidence-content";

const heifBrands = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);
// Native Canvas stays a Node runtime dependency rather than a Turbopack ESM
// asset. PDF rendering is server-only and never reaches a client bundle.
const requireNodeModule = createRequire(import.meta.url);
const canvasPackageName = ["@napi-rs", "canvas"].join("/");
const imageMimeFormat: Readonly<
  Record<
    Exclude<ClearanceEvidenceMimeType, "application/pdf">,
    PublicStorySubmissionMediaClearanceEvidenceFormat
  >
> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "image/heic": "HEIF",
  "image/heif": "HEIF",
};
const extensionFormat: Readonly<
  Record<string, PublicStorySubmissionMediaClearanceEvidenceFormat>
> = {
  pdf: "PDF",
  jpeg: "JPEG",
  jpg: "JPEG",
  png: "PNG",
  webp: "WEBP",
  heic: "HEIF",
  heif: "HEIF",
  hif: "HEIF",
};

export class ClearanceEvidenceProcessingError extends Error {
  constructor(
    readonly reason: PublicStorySubmissionMediaClearanceEvidenceRejectionReason,
    message: string,
  ) {
    super(message);
    this.name = "ClearanceEvidenceProcessingError";
  }
}

export type ProcessedClearanceEvidence = Readonly<{
  detectedFormat: PublicStorySubmissionMediaClearanceEvidenceFormat;
  reviewPages: readonly Readonly<{
    body: Uint8Array;
    width: number;
    height: number;
  }>[];
}>;

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function extensionFrom(filename: string | null) {
  if (!filename) return null;
  const basename = filename.split(/[\\/]/u).at(-1) ?? "";
  const dot = basename.lastIndexOf(".");
  return dot <= 0 || dot === basename.length - 1
    ? null
    : basename.slice(dot + 1).toLowerCase();
}

function detectHeif(bytes: Uint8Array) {
  if (bytes.byteLength < 16 || ascii(bytes, 4, 8) !== "ftyp") return null;
  const brands = [ascii(bytes, 8, 12)];
  for (let offset = 16; offset + 4 <= bytes.byteLength; offset += 4)
    brands.push(ascii(bytes, offset, offset + 4));
  return brands.some((brand) => heifBrands.has(brand)) ? "HEIF" : null;
}

export function detectClearanceEvidenceFormat(
  body: Uint8Array,
): PublicStorySubmissionMediaClearanceEvidenceFormat | null {
  if (body.byteLength >= 5 && ascii(body, 0, 5) === "%PDF-") return "PDF";
  if (
    body.byteLength >= 3 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff
  )
    return "JPEG";
  if (body.byteLength >= 8 && ascii(body, 0, 8) === "\u0089PNG\r\n\u001a\n")
    return "PNG";
  if (
    body.byteLength >= 12 &&
    ascii(body, 0, 4) === "RIFF" &&
    ascii(body, 8, 12) === "WEBP"
  )
    return "WEBP";
  return detectHeif(body);
}

export function assertClearanceEvidenceConsistency(input: {
  readonly body: Uint8Array;
  readonly declaredMimeType: ClearanceEvidenceMimeType;
  readonly originalFilename: string | null;
}) {
  const detectedFormat = detectClearanceEvidenceFormat(input.body);
  if (!detectedFormat)
    throw new ClearanceEvidenceProcessingError(
      "UNSUPPORTED_FORMAT",
      "Evidence bytes do not match a supported file signature.",
    );
  const declaredFormat =
    input.declaredMimeType === "application/pdf"
      ? "PDF"
      : imageMimeFormat[input.declaredMimeType];
  if (detectedFormat !== declaredFormat)
    throw new ClearanceEvidenceProcessingError(
      "MIME_TYPE_MISMATCH",
      "Declared evidence type does not match its signature.",
    );
  const extension = extensionFrom(input.originalFilename);
  if (extension !== null && extensionFormat[extension] !== detectedFormat)
    throw new ClearanceEvidenceProcessingError(
      "MIME_TYPE_MISMATCH",
      "Evidence filename extension does not match its signature.",
    );
  return detectedFormat;
}

function assertDimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new ClearanceEvidenceProcessingError(
      "CORRUPTED_FILE",
      "Evidence dimensions are invalid.",
    );
  if (
    width > CLEARANCE_EVIDENCE_MAX_WIDTH ||
    height > CLEARANCE_EVIDENCE_MAX_HEIGHT ||
    width * height > CLEARANCE_EVIDENCE_MAX_PIXELS
  ) {
    throw new ClearanceEvidenceProcessingError(
      "DIMENSIONS_EXCEEDED",
      "Evidence dimensions exceed the confidential processing limit.",
    );
  }
}

function imageInput(body: Uint8Array) {
  return sharp(Buffer.from(body), {
    animated: false,
    failOn: "warning",
    limitInputPixels: CLEARANCE_EVIDENCE_MAX_PIXELS,
    pages: 1,
    sequentialRead: true,
    unlimited: false,
  });
}

async function jpegReviewPage(input: Sharp) {
  const result = await input
    .rotate()
    .resize({
      width: CLEARANCE_EVIDENCE_REVIEW_MAX_EDGE,
      height: CLEARANCE_EVIDENCE_REVIEW_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({
      chromaSubsampling: "4:2:0",
      mozjpeg: true,
      progressive: true,
      quality: 82,
    })
    .toBuffer({ resolveWithObject: true });
  return {
    body: new Uint8Array(result.data),
    width: result.info.width,
    height: result.info.height,
  };
}

async function processImage(
  body: Uint8Array,
  format: Exclude<PublicStorySubmissionMediaClearanceEvidenceFormat, "PDF">,
): Promise<ProcessedClearanceEvidence> {
  try {
    if (format === "HEIF") {
      const images = await decodeHeic.all({ buffer: body });
      try {
        if (images.length !== 1)
          throw new ClearanceEvidenceProcessingError(
            "MULTI_FRAME_UNSUPPORTED",
            "Image sequences are not accepted.",
          );
        const image = images[0];
        if (!image)
          throw new ClearanceEvidenceProcessingError(
            "CORRUPTED_FILE",
            "HEIF data is unavailable.",
          );
        assertDimensions(image.width, image.height);
        const decoded = await image.decode();
        if (decoded.width !== image.width || decoded.height !== image.height)
          throw new ClearanceEvidenceProcessingError(
            "CORRUPTED_FILE",
            "HEIF dimensions are inconsistent.",
          );
        return {
          detectedFormat: format,
          reviewPages: [
            await jpegReviewPage(
              sharp(
                Buffer.from(
                  decoded.data.buffer,
                  decoded.data.byteOffset,
                  decoded.data.byteLength,
                ),
                {
                  raw: {
                    width: decoded.width,
                    height: decoded.height,
                    channels: 4,
                  },
                },
              ),
            ),
          ],
        };
      } finally {
        images.dispose();
      }
    }
    const metadata = await imageInput(body).metadata();
    if ((metadata.pages ?? 1) !== 1)
      throw new ClearanceEvidenceProcessingError(
        "MULTI_FRAME_UNSUPPORTED",
        "Animated or multi-frame images are not accepted.",
      );
    const normalized = metadata.autoOrient;
    assertDimensions(
      normalized.width ?? metadata.width ?? 0,
      normalized.height ?? metadata.height ?? 0,
    );
    return {
      detectedFormat: format,
      reviewPages: [await jpegReviewPage(imageInput(body))],
    };
  } catch (error) {
    if (error instanceof ClearanceEvidenceProcessingError) throw error;
    if (
      error instanceof Error &&
      /pixel|dimension|exceeds limit/iu.test(error.message)
    )
      throw new ClearanceEvidenceProcessingError(
        "DIMENSIONS_EXCEEDED",
        "Evidence dimensions exceed the confidential processing limit.",
      );
    throw new ClearanceEvidenceProcessingError(
      "CORRUPTED_FILE",
      "Evidence image decoding failed.",
    );
  }
}

function assertSafePdfStructure(body: Uint8Array) {
  // This preflight rejects action-bearing PDF name objects. PDF.js receives
  // bytes, never a URL; JavaScript evaluation, XFA, annotation rendering, and
  // worker/network fetching are disabled below.
  const source = Buffer.from(body).toString("latin1");
  if (/\/(?:JavaScript|JS|Launch|AA|OpenAction)\b/u.test(source)) {
    throw new ClearanceEvidenceProcessingError(
      "PDF_UNSAFE_STRUCTURE",
      "PDF active actions are not accepted for confidential review.",
    );
  }
  if (/\/Encrypt\b/u.test(source)) {
    throw new ClearanceEvidenceProcessingError(
      "PDF_ENCRYPTED",
      "Encrypted PDFs are not accepted.",
    );
  }
}

async function processPdf(
  body: Uint8Array,
): Promise<ProcessedClearanceEvidence> {
  if (body.byteLength > CLEARANCE_EVIDENCE_MAX_PDF_BYTES)
    throw new ClearanceEvidenceProcessingError(
      "FILE_TOO_LARGE",
      "Evidence PDF exceeds 15 MB.",
    );
  assertSafePdfStructure(body);
  let loadingTask: ReturnType<typeof pdfjs.getDocument> | null = null;
  let document: Awaited<
    ReturnType<typeof pdfjs.getDocument>["promise"]
  > | null = null;
  try {
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(body),
      disableAutoFetch: true,
      disableStream: true,
      stopAtErrors: true,
      enableXfa: false,
      isEvalSupported: false,
      useWorkerFetch: false,
    });
    document = await loadingTask.promise;
    if (document.numPages > CLEARANCE_EVIDENCE_MAX_PDF_PAGES)
      throw new ClearanceEvidenceProcessingError(
        "PDF_PAGE_LIMIT_EXCEEDED",
        "Evidence PDFs may contain at most 25 pages.",
      );
    if (document.numPages < 1)
      throw new ClearanceEvidenceProcessingError(
        "CORRUPTED_FILE",
        "Evidence PDF contains no pages.",
      );
    const reviewPages: Array<{
      body: Uint8Array;
      width: number;
      height: number;
    }> = [];
    for (let ordinal = 1; ordinal <= document.numPages; ordinal += 1) {
      const page = await document.getPage(ordinal);
      try {
        const source = page.getViewport({ scale: 1 });
        assertDimensions(Math.ceil(source.width), Math.ceil(source.height));
        const scale = Math.min(
          CLEARANCE_EVIDENCE_REVIEW_MAX_EDGE / source.width,
          CLEARANCE_EVIDENCE_REVIEW_MAX_EDGE / source.height,
          1,
        );
        const viewport = page.getViewport({ scale });
        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));
        const { createCanvas } = requireNodeModule(canvasPackageName) as {
          createCanvas: (
            width: number,
            height: number,
          ) => {
            getContext: (contextId: "2d") => unknown;
            toBuffer: (mimeType: "image/jpeg", quality: number) => Buffer;
          };
        };
        const canvas = createCanvas(width, height);
        const context = canvas.getContext("2d");
        await page.render({
          canvas: canvas as never,
          canvasContext: context as never,
          viewport,
          annotationMode: pdfjs.AnnotationMode.DISABLE,
          intent: "display",
        }).promise;
        reviewPages.push({
          body: new Uint8Array(canvas.toBuffer("image/jpeg", 82)),
          width,
          height,
        });
      } finally {
        page.cleanup();
      }
    }
    return { detectedFormat: "PDF", reviewPages };
  } catch (error) {
    if (error instanceof ClearanceEvidenceProcessingError) throw error;
    if (error instanceof Error && /password|encrypt/iu.test(error.message))
      throw new ClearanceEvidenceProcessingError(
        "PDF_ENCRYPTED",
        "Encrypted PDFs are not accepted.",
      );
    throw new ClearanceEvidenceProcessingError(
      "CORRUPTED_FILE",
      "Evidence PDF parsing or rendering failed.",
    );
  } finally {
    document?.cleanup();
    await loadingTask?.destroy();
  }
}

export async function processClearanceEvidence(input: {
  readonly body: Uint8Array;
  readonly declaredMimeType: ClearanceEvidenceMimeType;
  readonly originalFilename: string | null;
}): Promise<ProcessedClearanceEvidence> {
  const limit =
    input.declaredMimeType === "application/pdf"
      ? CLEARANCE_EVIDENCE_MAX_PDF_BYTES
      : CLEARANCE_EVIDENCE_MAX_IMAGE_BYTES;
  if (input.body.byteLength === 0 || input.body.byteLength > limit)
    throw new ClearanceEvidenceProcessingError(
      "FILE_TOO_LARGE",
      "Evidence bytes exceed their processing limit.",
    );
  const format = assertClearanceEvidenceConsistency(input);
  return format === "PDF"
    ? processPdf(input.body)
    : processImage(input.body, format);
}
