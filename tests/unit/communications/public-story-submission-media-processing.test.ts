import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  SUBMISSION_MEDIA_REVIEW_DERIVATIVE_MAX_EDGE,
  SubmissionMediaProcessingError,
  assertSubmissionMediaConsistency,
  detectSubmissionMediaFormat,
  processSubmissionMediaImage,
} from "@/modules/communications/submissions";

// A 4×3 HEVC HEIC generated from an artificial solid-color image with
// libheif's heif-enc. It contains no person, location, or source EXIF data.
const singleImageHeic = Buffer.from(
  "AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAAmxtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAANGlsb2MAAAAAREAAAgABAAAAAAKQAAEAAAAAAAAANwACAAAAAALHAAEAAAAAAAAAHwAAADhpaW5mAAAAAAACAAAAFWluZmUCAAAAAAEAAGh2YzEAAAAAFWluZmUCAAAAAAIAAGh2YzEAAAABq2lwcnAAAAGDaXBjbwAAAHZodmNDAQNwAAAAAAAAAAAAHvAA/P34+AAADwMgAAEAGEABDAH//wNwAAADAJAAAAMAAAMAHroCQCEAAQAqQgEBA3AAAAMAkAAAAwAAAwAeoCCBBZbqrprm4CGgwIAAAAMAgAAAAwCEIgABAAZEAcFzwYkAAAATY29scm5jbHgAAQANAAaAAAAAFGlzcGUAAAAAAAAAQAAAAEAAAAAoY2xhcAAAAAQAAAABAAAAAwAAAAH////EAAAAAv///8MAAAACAAAAEHBpeGkAAAAAAwgICAAAAHFodmNDAQQIAAAAAAAAAAAAHvAA/Pz4+AAADwMgAAEAF0ABDAH//wQIAAADAJ/4AAADAAAeugJAIQABACZCAQEECAAAAwCf+AAAAwAAHsCCBBZbqrprmwIAAAMAAgAAAwACECIAAQAGRAHBc8GJAAAADnBpeGkAAAAAAQgAAAAnYXV4QwAAAAB1cm46bXBlZzpoZXZjOjIwMTU6YXV4aWQ6MQAAAAAgaXBtYQAAAAAAAAACAAEFgQIDBYQAAgWGAweIhAAAABppcmVmAAAAAAAAAA5hdXhsAAIAAQABAAAAXm1kYXQAAAAzKAGvBjIWhzSJIPC/1VT/1/vW///uASs1snrhH6Bjx+S3kJGe9F97GFLlPHQg9JxTuc2AAAAAGygBrgxkdki4Altm9oB70biZlIQXNX9ALxe2Zg==",
  "base64",
);

async function jpeg(width = 12, height = 8) {
  return new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 15, g: 45, b: 75 },
      },
    })
      .jpeg()
      .toBuffer(),
  );
}

describe("C6B-3B private submission image processing", () => {
  it("uses signatures as authoritative and rejects MIME or filename mismatches", async () => {
    const image = await jpeg();
    expect(detectSubmissionMediaFormat(image)).toBe("JPEG");
    try {
      assertSubmissionMediaConsistency({
        detectedFormat: "JPEG",
        declaredMimeType: "image/png",
        originalFilename: "submitted.png",
      });
      throw new Error("expected mismatch rejection");
    } catch (error) {
      expect(error).toMatchObject({ reason: "MIME_TYPE_MISMATCH" });
    }
    await expect(
      processSubmissionMediaImage({
        body: image,
        declaredMimeType: "image/jpeg",
        originalFilename: "submitted.webp",
      }),
    ).rejects.toMatchObject({ reason: "MIME_TYPE_MISMATCH" });
    await expect(
      processSubmissionMediaImage({
        body: new Uint8Array([0xff, 0xd8, 0xff, 0x00]),
        declaredMimeType: "image/jpeg",
        originalFilename: null,
      }),
    ).rejects.toMatchObject({ reason: "CORRUPTED_IMAGE" });
  });

  it("normalizes orientation, strips metadata, bounds derivatives, and flattens transparency to JPEG", async () => {
    const original = new Uint8Array(
      await sharp({
        create: {
          width: 3_000,
          height: 1_200,
          channels: 4,
          background: { r: 10, g: 80, b: 140, alpha: 0.5 },
        },
      })
        .withMetadata({
          orientation: 6,
          exif: { IFD0: { Artist: "private device metadata" } },
        })
        .png()
        .toBuffer(),
    );
    const processed = await processSubmissionMediaImage({
      body: original,
      declaredMimeType: "image/png",
      originalFilename: "camera-upload.png",
    });
    const metadata = await sharp(processed.reviewDerivative).metadata();
    expect(processed).toMatchObject({
      detectedFormat: "PNG",
      sourceWidth: 1_200,
      sourceHeight: 3_000,
      reviewDerivativeFormat: "JPEG",
      reviewDerivativeWidth: 960,
      reviewDerivativeHeight: SUBMISSION_MEDIA_REVIEW_DERIVATIVE_MAX_EDGE,
    });
    expect(metadata).toMatchObject({
      format: "jpeg",
      width: 960,
      height: 2400,
    });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.hasAlpha).toBe(false);
  });

  it("supports a real single-image HEIC through the cross-platform decoder", async () => {
    const processed = await processSubmissionMediaImage({
      body: singleImageHeic,
      declaredMimeType: "image/heic",
      originalFilename: "generated.heic",
    });
    expect(processed).toMatchObject({
      detectedFormat: "HEIF",
      sourceWidth: 4,
      sourceHeight: 3,
      reviewDerivativeFormat: "JPEG",
      reviewDerivativeWidth: 4,
      reviewDerivativeHeight: 3,
    });
    expect((await sharp(processed.reviewDerivative).metadata()).format).toBe(
      "jpeg",
    );
  });

  it("rejects animated/multi-frame input and decoded resource-limit excesses", async () => {
    const first = await jpeg(2, 2);
    const second = new Uint8Array(
      await sharp({
        create: {
          width: 2,
          height: 2,
          channels: 3,
          background: { r: 210, g: 30, b: 20 },
        },
      })
        .png()
        .toBuffer(),
    );
    const animated = new Uint8Array(
      await sharp([first, second], { join: { animated: true } })
        .webp()
        .toBuffer(),
    );
    await expect(
      processSubmissionMediaImage({
        body: animated,
        declaredMimeType: "image/webp",
        originalFilename: "animated.webp",
      }),
    ).rejects.toMatchObject({ reason: "MULTI_FRAME_UNSUPPORTED" });
    const tooWide = new Uint8Array(
      await sharp({
        create: {
          width: 12_001,
          height: 1,
          channels: 3,
          background: "black",
        },
      })
        .png()
        .toBuffer(),
    );
    await expect(
      processSubmissionMediaImage({
        body: tooWide,
        declaredMimeType: "image/png",
        originalFilename: "too-wide.png",
      }),
    ).rejects.toMatchObject({ reason: "DIMENSIONS_EXCEEDED" });
  });

  it("uses safe typed processing errors without decoder internals in the outcome", () => {
    const error = new SubmissionMediaProcessingError(
      "CORRUPTED_IMAGE",
      "safe operational message",
    );
    expect(error.name).toBe("SubmissionMediaProcessingError");
    expect(error.reason).toBe("CORRUPTED_IMAGE");
  });
});
