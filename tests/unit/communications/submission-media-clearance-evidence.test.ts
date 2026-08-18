import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  CLEARANCE_EVIDENCE_MAX_IMAGE_BYTES,
  CLEARANCE_EVIDENCE_MAX_PDF_BYTES,
  ClearanceEvidenceProcessingError,
  assertClearanceEvidenceConsistency,
  assertClearanceEvidenceTransition,
  detectClearanceEvidenceFormat,
  issueClearanceEvidenceUploadAuthorization,
  processClearanceEvidence,
  validateClearanceEvidenceByteSize,
  verifyClearanceEvidenceUploadAuthorization,
} from "@/modules/communications/submissions";
import { ValidationError } from "@/platform/errors/app-error";

const secret = "c6b3d-unit-evidence-upload-secret-that-is-at-least-32-bytes";
const clearanceId = "11111111-1111-4111-8111-111111111111";
const evidenceDocumentId = "22222222-2222-4222-8222-222222222222";

// A 4×3 static HEIC fixture generated once with libheif; it contains neither
// source metadata nor personal content. It is retained as binary test input.
const singleImageHeic = Buffer.from(
  "AAAAHGZ0eXBoZWljAAAAAG1pZjFoZWljbWlhZgAAAmxtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAANGlsb2MAAAAAREAAAgABAAAAAAKQAAEAAAAAAAAANwACAAAAAALHAAEAAAAAAAAAHwAAADhpaW5mAAAAAAACAAAAFWluZmUCAAAAAAEAAGh2YzEAAAAAFWluZmUCAAAAAAIAAGh2YzEAAAABq2lwcnAAAAGDaXBjbwAAAHZodmNDAQNwAAAAAAAAAAAAHvAA/P34+AAADwMgAAEAGEABDAH//wNwAAADAJAAAAMAAAMAHroCQCEAAQAqQgEBA3AAAAMAkAAAAwAAAwAeoCCBBZbqrprm4CGgwIAAAAMAgAAAAwCEIgABAAZEAcFzwYkAAAATY29scm5jbHgAAQANAAaAAAAAFGlzcGUAAAAAAAAAQAAAAEAAAAAoY2xhcAAAAAQAAAABAAAAAwAAAAH////EAAAAAv///8MAAAACAAAAEHBpeGkAAAAAAwgICAAAAHFodmNDAQQIAAAAAAAAAAAAHvAA/Pz4+AAADwMgAAEAF0ABDAH//wQIAAADAJ/4AAADAAAeugJAIQABACZCAQEECAAAAwCf+AAAAwAAHsCCBBZbqrprmwIAAAMAAgAAAwACECIAAQAGRAHBc8GJAAAADnBpeGkAAAAAAQgAAAAnYXV4QwAAAAB1cm46bXBlZzpoZXZjOjIwMTU6YXV4aWQ6MQAAAAAgaXBtYQAAAAAAAAACAAEFgQIDBYQAAgWGAweIhAAAABppcmVmAAAAAAAAAA5hdXhsAAIAAQABAAAAXm1kYXQAAAAzKAGvBjIWhzSJIPC/1VT/1/vW///uASs1snrhH6Bjx+S3kJGe9F97GFLlPHQg9JxTuc2AAAAAGygBrgxkdki4Altm9oB70biZlIQXNX9ALxe2Zg==",
  "base64",
);

function pdf(pageCount = 1, extra = "") {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 R`).join(" ")}] /Count ${pageCount} >>`,
    ...Array.from(
      { length: pageCount },
      () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>",
    ),
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${extra} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body));
}

async function image(format: "jpeg" | "png" | "webp") {
  return new Uint8Array(
    await sharp({
      create: { width: 12, height: 8, channels: 3, background: "#27506e" },
    })
      [format]()
      .toBuffer(),
  );
}

describe("C6B-3D private clearance evidence content and processing", () => {
  it("uses closed limits, state transitions, and one-purpose upload authorization", () => {
    expect(() =>
      validateClearanceEvidenceByteSize(
        CLEARANCE_EVIDENCE_MAX_IMAGE_BYTES + 1,
        "image/jpeg",
      ),
    ).toThrow(ValidationError);
    expect(() =>
      validateClearanceEvidenceByteSize(
        CLEARANCE_EVIDENCE_MAX_PDF_BYTES + 1,
        "application/pdf",
      ),
    ).toThrow(ValidationError);
    expect(() =>
      assertClearanceEvidenceTransition("PENDING_UPLOAD", "UPLOADED"),
    ).not.toThrow();
    expect(() =>
      assertClearanceEvidenceTransition("READY", "UPLOADED"),
    ).toThrow(ValidationError);
    const authorization = issueClearanceEvidenceUploadAuthorization({
      secret,
      clearanceId,
      evidenceDocumentId,
      uploaderAdminUserId: "33333333-3333-4333-8333-333333333333",
      slot: 3,
      mimeType: "application/pdf",
      now: new Date("2044-01-01T00:00:00.000Z"),
    });
    expect(authorization.token).not.toContain(clearanceId);
    expect(
      verifyClearanceEvidenceUploadAuthorization(authorization.token, {
        secret,
        now: new Date("2044-01-01T00:01:00.000Z"),
      }),
    ).toMatchObject({
      clearanceId,
      evidenceDocumentId,
      uploaderAdminUserId: "33333333-3333-4333-8333-333333333333",
      slot: 3,
      mimeType: "application/pdf",
      maxByteSize: CLEARANCE_EVIDENCE_MAX_PDF_BYTES,
    });
    expect(
      verifyClearanceEvidenceUploadAuthorization(`${authorization.token}x`, {
        secret,
      }),
    ).toBeNull();
  });

  it("detects every allowed format from bytes and rejects declared or extension mismatches", async () => {
    const jpeg = await image("jpeg");
    const png = await image("png");
    const webp = await image("webp");
    expect(detectClearanceEvidenceFormat(pdf())).toBe("PDF");
    expect(detectClearanceEvidenceFormat(jpeg)).toBe("JPEG");
    expect(detectClearanceEvidenceFormat(png)).toBe("PNG");
    expect(detectClearanceEvidenceFormat(webp)).toBe("WEBP");
    expect(detectClearanceEvidenceFormat(singleImageHeic)).toBe("HEIF");
    expect(() =>
      assertClearanceEvidenceConsistency({
        body: jpeg,
        declaredMimeType: "image/png",
        originalFilename: "release.png",
      }),
    ).toThrow(ClearanceEvidenceProcessingError);
    await expect(
      processClearanceEvidence({
        body: pdf(),
        declaredMimeType: "application/pdf",
        originalFilename: "release.jpg",
      }),
    ).rejects.toMatchObject({ reason: "MIME_TYPE_MISMATCH" });
  });

  it("creates metadata-stripped private JPEG review pages for every accepted image family", async () => {
    const cases: Array<
      [
        "image/jpeg" | "image/png" | "image/webp",
        "jpeg" | "png" | "webp",
        string,
      ]
    > = [
      ["image/jpeg", "jpeg", "JPEG"],
      ["image/png", "png", "PNG"],
      ["image/webp", "webp", "WEBP"],
    ];
    for (const [mimeType, format, detectedFormat] of cases) {
      const processed = await processClearanceEvidence({
        body: await image(format),
        declaredMimeType: mimeType,
        originalFilename: `evidence.${format === "jpeg" ? "jpg" : format}`,
      });
      expect(processed).toMatchObject({
        detectedFormat,
        reviewPages: [{ width: 12, height: 8 }],
      });
      expect(
        (await sharp(processed.reviewPages[0]!.body).metadata()).format,
      ).toBe("jpeg");
    }
    const heic = await processClearanceEvidence({
      body: singleImageHeic,
      declaredMimeType: "image/heic",
      originalFilename: "evidence.heic",
    });
    expect(heic).toMatchObject({
      detectedFormat: "HEIF",
      reviewPages: [{ width: 4, height: 3 }],
    });
  });

  it("rasterizes a valid PDF without active content and rejects encrypted, unsafe, and oversized page-count PDFs", async () => {
    const processed = await processClearanceEvidence({
      body: pdf(),
      declaredMimeType: "application/pdf",
      originalFilename: "release.pdf",
    });
    expect(processed).toMatchObject({
      detectedFormat: "PDF",
      reviewPages: [{ width: 100, height: 100 }],
    });
    await expect(
      processClearanceEvidence({
        body: pdf(26),
        declaredMimeType: "application/pdf",
        originalFilename: "too-many.pdf",
      }),
    ).rejects.toMatchObject({ reason: "PDF_PAGE_LIMIT_EXCEEDED" });
    await expect(
      processClearanceEvidence({
        body: pdf(1, "/Encrypt 9 0 R"),
        declaredMimeType: "application/pdf",
        originalFilename: "encrypted.pdf",
      }),
    ).rejects.toMatchObject({ reason: "PDF_ENCRYPTED" });
    await expect(
      processClearanceEvidence({
        body: new Uint8Array([...pdf(), ...Buffer.from(" /JavaScript")]),
        declaredMimeType: "application/pdf",
        originalFilename: "unsafe.pdf",
      }),
    ).rejects.toMatchObject({ reason: "PDF_UNSAFE_STRUCTURE" });
  });
});
