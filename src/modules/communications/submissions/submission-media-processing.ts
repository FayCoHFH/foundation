import "server-only";

import sharp, { type Sharp } from "sharp";
import decodeHeic from "heic-decode";

import { PublicStorySubmissionMediaRejectionReason } from "@/generated/prisma/client";

import {
  SUBMISSION_MEDIA_MAX_BYTES,
  SUBMISSION_MEDIA_MAX_HEIGHT,
  SUBMISSION_MEDIA_MAX_PIXELS,
  SUBMISSION_MEDIA_MAX_WIDTH,
  SUBMISSION_MEDIA_REVIEW_DERIVATIVE_MAX_EDGE,
  submissionMediaReviewDerivativeFormat,
  type SubmissionMediaDetectedFormat,
  type SubmissionMediaMimeType,
} from "./submission-media-content";

const heifBrands = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

const extensionFormats: Readonly<
  Record<string, SubmissionMediaDetectedFormat>
> = {
  jpeg: "JPEG",
  jpg: "JPEG",
  png: "PNG",
  webp: "WEBP",
  heic: "HEIF",
  heif: "HEIF",
  hif: "HEIF",
};

const mimeFormats: Readonly<
  Record<SubmissionMediaMimeType, SubmissionMediaDetectedFormat>
> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "image/heic": "HEIF",
  "image/heif": "HEIF",
};

export class SubmissionMediaProcessingError extends Error {
  constructor(
    readonly reason: PublicStorySubmissionMediaRejectionReason,
    message: string,
  ) {
    super(message);
    this.name = "SubmissionMediaProcessingError";
  }
}

export type ProcessedSubmissionMedia = Readonly<{
  detectedFormat: SubmissionMediaDetectedFormat;
  sourceWidth: number;
  sourceHeight: number;
  reviewDerivative: Uint8Array;
  reviewDerivativeFormat: typeof submissionMediaReviewDerivativeFormat;
  reviewDerivativeWidth: number;
  reviewDerivativeHeight: number;
}>;

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function extensionFrom(filename: string | null) {
  if (!filename) return null;
  const basename = filename.split(/[\\/]/u).at(-1) ?? "";
  const dot = basename.lastIndexOf(".");
  if (dot <= 0 || dot === basename.length - 1) return null;
  return basename.slice(dot + 1).toLowerCase();
}

function heifBrand(bytes: Uint8Array) {
  if (bytes.byteLength < 16 || ascii(bytes, 4, 8) !== "ftyp") return null;
  const brands = [ascii(bytes, 8, 12)];
  for (let offset = 16; offset + 4 <= bytes.byteLength; offset += 4) {
    brands.push(ascii(bytes, offset, offset + 4));
  }
  return brands.some((brand) => heifBrands.has(brand)) ? "HEIF" : null;
}

/** Determine format from bytes only; declared types and names are checked later. */
export function detectSubmissionMediaFormat(
  body: Uint8Array,
): SubmissionMediaDetectedFormat | null {
  if (
    body.byteLength >= 3 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff
  ) {
    return "JPEG";
  }
  if (body.byteLength >= 8 && ascii(body, 0, 8) === "\u0089PNG\r\n\u001a\n") {
    return "PNG";
  }
  if (
    body.byteLength >= 12 &&
    ascii(body, 0, 4) === "RIFF" &&
    ascii(body, 8, 12) === "WEBP"
  ) {
    return "WEBP";
  }
  return heifBrand(body);
}

function assertImageDimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new SubmissionMediaProcessingError(
      "CORRUPTED_IMAGE",
      "Image dimensions are invalid.",
    );
  }
  if (
    width > SUBMISSION_MEDIA_MAX_WIDTH ||
    height > SUBMISSION_MEDIA_MAX_HEIGHT ||
    width * height > SUBMISSION_MEDIA_MAX_PIXELS
  ) {
    throw new SubmissionMediaProcessingError(
      "DIMENSIONS_EXCEEDED",
      "Image dimensions exceed the private processing limit.",
    );
  }
}

export function assertSubmissionMediaConsistency(input: {
  readonly detectedFormat: SubmissionMediaDetectedFormat | null;
  readonly declaredMimeType: SubmissionMediaMimeType;
  readonly originalFilename: string | null;
}) {
  if (!input.detectedFormat) {
    throw new SubmissionMediaProcessingError(
      "UNSUPPORTED_FORMAT",
      "Image bytes do not match a supported image signature.",
    );
  }
  if (mimeFormats[input.declaredMimeType] !== input.detectedFormat) {
    throw new SubmissionMediaProcessingError(
      "MIME_TYPE_MISMATCH",
      "Declared image type does not match the image signature.",
    );
  }
  const extension = extensionFrom(input.originalFilename);
  if (
    extension !== null &&
    extensionFormats[extension] !== input.detectedFormat
  ) {
    throw new SubmissionMediaProcessingError(
      "MIME_TYPE_MISMATCH",
      "Image filename extension does not match the image signature.",
    );
  }
  return input.detectedFormat;
}

function processingInput(body: Uint8Array) {
  return sharp(Buffer.from(body), {
    animated: false,
    failOn: "warning",
    limitInputPixels: SUBMISSION_MEDIA_MAX_PIXELS,
    pages: 1,
    sequentialRead: true,
    unlimited: false,
  });
}

async function encodeReviewDerivative(
  input: Sharp,
): Promise<Readonly<{ body: Uint8Array; width: number; height: number }>> {
  const result = await input
    .rotate()
    .resize({
      width: SUBMISSION_MEDIA_REVIEW_DERIVATIVE_MAX_EDGE,
      height: SUBMISSION_MEDIA_REVIEW_DERIVATIVE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    // JPEG has no alpha channel; intentional white flattening is our review-only
    // transparency policy rather than a format-dependent implicit conversion.
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

async function processNativeImage(
  body: Uint8Array,
  detectedFormat: Exclude<SubmissionMediaDetectedFormat, "HEIF">,
) {
  const metadata = await processingInput(body).metadata();
  if ((metadata.pages ?? 1) !== 1) {
    throw new SubmissionMediaProcessingError(
      "MULTI_FRAME_UNSUPPORTED",
      "Animated or multi-frame images are not accepted.",
    );
  }
  if (!metadata.width || !metadata.height) {
    throw new SubmissionMediaProcessingError(
      "CORRUPTED_IMAGE",
      "Image dimensions are unavailable.",
    );
  }
  const normalized = metadata.autoOrient;
  const sourceWidth = normalized.width ?? metadata.width;
  const sourceHeight = normalized.height ?? metadata.height;
  assertImageDimensions(sourceWidth, sourceHeight);
  const derivative = await encodeReviewDerivative(processingInput(body));
  return {
    detectedFormat,
    sourceWidth,
    sourceHeight,
    reviewDerivative: derivative.body,
    reviewDerivativeFormat: submissionMediaReviewDerivativeFormat,
    reviewDerivativeWidth: derivative.width,
    reviewDerivativeHeight: derivative.height,
  } satisfies ProcessedSubmissionMedia;
}

async function processHeifImage(body: Uint8Array) {
  const images = await decodeHeic.all({ buffer: body });
  try {
    if (images.length !== 1) {
      throw new SubmissionMediaProcessingError(
        "MULTI_FRAME_UNSUPPORTED",
        "HEIF image sequences and multi-image files are not accepted.",
      );
    }
    const image = images[0];
    if (!image) {
      throw new SubmissionMediaProcessingError(
        "CORRUPTED_IMAGE",
        "HEIF image data is unavailable.",
      );
    }
    assertImageDimensions(image.width, image.height);
    const decoded = await image.decode();
    if (decoded.width !== image.width || decoded.height !== image.height) {
      throw new SubmissionMediaProcessingError(
        "CORRUPTED_IMAGE",
        "HEIF decoded dimensions are inconsistent.",
      );
    }
    const derivative = await encodeReviewDerivative(
      sharp(
        Buffer.from(
          decoded.data.buffer,
          decoded.data.byteOffset,
          decoded.data.byteLength,
        ),
        { raw: { width: decoded.width, height: decoded.height, channels: 4 } },
      ),
    );
    return {
      detectedFormat: "HEIF",
      sourceWidth: decoded.width,
      sourceHeight: decoded.height,
      reviewDerivative: derivative.body,
      reviewDerivativeFormat: submissionMediaReviewDerivativeFormat,
      reviewDerivativeWidth: derivative.width,
      reviewDerivativeHeight: derivative.height,
    } satisfies ProcessedSubmissionMedia;
  } finally {
    images.dispose();
  }
}

/**
 * Processes only an already-authorized confidential original. No returned
 * value has a public URL, source metadata, or a caller-controlled filename.
 */
export async function processSubmissionMediaImage(input: {
  readonly body: Uint8Array;
  readonly declaredMimeType: SubmissionMediaMimeType;
  readonly originalFilename: string | null;
}): Promise<ProcessedSubmissionMedia> {
  if (
    input.body.byteLength === 0 ||
    input.body.byteLength > SUBMISSION_MEDIA_MAX_BYTES
  ) {
    throw new SubmissionMediaProcessingError(
      "FILE_TOO_LARGE",
      "Image bytes exceed the processing limit.",
    );
  }
  const detectedFormat = assertSubmissionMediaConsistency({
    detectedFormat: detectSubmissionMediaFormat(input.body),
    declaredMimeType: input.declaredMimeType,
    originalFilename: input.originalFilename,
  });
  try {
    if (detectedFormat === "HEIF") return await processHeifImage(input.body);
    return await processNativeImage(input.body, detectedFormat);
  } catch (error) {
    if (error instanceof SubmissionMediaProcessingError) throw error;
    if (
      error instanceof Error &&
      /pixel|dimension|exceeds limit/iu.test(error.message)
    ) {
      throw new SubmissionMediaProcessingError(
        "DIMENSIONS_EXCEEDED",
        "Image dimensions exceed the private processing limit.",
      );
    }
    throw new SubmissionMediaProcessingError(
      "CORRUPTED_IMAGE",
      "Image decoding failed.",
    );
  }
}
