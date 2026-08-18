"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createPublicStorySubmissionMediaClearance,
  createPublicStorySubmissionMediaSubject,
  promotePublicStorySubmissionMediaToLibrary,
  rejectPublicStorySubmissionMediaClearance,
  removePublicStorySubmissionClearanceEvidence,
  restorePublicStorySubmissionMediaEligibility,
  restrictPublicStorySubmissionMedia,
  revokePublicStorySubmissionMediaClearance,
  setPublicStorySubmissionMediaClearanceApplicability,
  updatePublicStorySubmissionMediaClearance,
  verifyPublicStorySubmissionMediaClearance,
  issuePublicStorySubmissionClearanceEvidenceUpload,
  uploadPublicStorySubmissionClearanceEvidence,
  processPublicStorySubmissionClearanceEvidence,
} from "@/modules/communications/submissions";
import { MediaAssetCreditTreatment } from "@/generated/prisma/client";
import { hasCapability, resolveAdminAccess } from "@/platform/auth/principal";
import {
  getRuntimePublicObjectStore,
  getRuntimeSubmissionClearanceEvidenceStorage,
  getRuntimeSubmissionQuarantineStorage,
} from "@/platform/storage";
import { readServerEnvironment } from "@/platform/config/environment";
import { prisma } from "@/platform/database/prisma";
import {
  AppError,
  AuthorizationError,
  ConcurrencyError,
} from "@/platform/errors/app-error";

export type SubmissionMediaActionState = Readonly<{
  status: "idle" | "error";
  message?: string;
}>;

async function currentPrincipal(
  capability?:
    | "communications.submissions.review"
    | "communications.media.promote"
    | "communications.media.restore_eligibility",
) {
  const access = await resolveAdminAccess();
  if (access.status !== "authorized") throw new AuthorizationError();
  if (
    capability !== undefined &&
    !hasCapability(access.principal, capability)
  ) {
    throw new AuthorizationError();
  }
  return access.principal;
}

function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item : "";
}

function actionFormData(
  first: SubmissionMediaActionState | FormData,
  second?: FormData,
) {
  return second ?? (first instanceof FormData ? first : new FormData());
}

function optionalDate(formData: FormData, name: string) {
  const raw = value(formData, name).trim();
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function expectedVersion(formData: FormData, name: string) {
  const parsed = Number(value(formData, name));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function actionError(error: unknown) {
  if (error instanceof ConcurrencyError)
    return "This review changed in another session. Reload before continuing.";
  if (error instanceof AppError && error.expose) return error.message;
  return "The administrative media action could not be completed. Try again.";
}

function redirectToMedia(
  submissionId: string,
  mediaId: string,
  code: string,
): never {
  revalidatePath(`/admin/communications/submissions/${submissionId}`);
  revalidatePath(
    `/admin/communications/submissions/${submissionId}/media/${mediaId}`,
  );
  redirect(
    `/admin/communications/submissions/${submissionId}/media/${mediaId}?media=${encodeURIComponent(code)}`,
  );
}

function errorState(error: unknown): SubmissionMediaActionState {
  return { status: "error", message: actionError(error) };
}

export async function createSubmissionMediaSubjectAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal(
      "communications.submissions.review",
    );
    await createPublicStorySubmissionMediaSubject(prisma, principal, {
      submissionId,
      displayLabel: value(formData, "displayLabel"),
      subjectType: value(formData, "subjectType") as never,
      isSubmitter: checked(formData, "isSubmitter"),
      mediaIds: mediaId ? [mediaId] : [],
    });
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "subject-created");
}

export async function createSubmissionMediaClearanceAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal(
      "communications.submissions.review",
    );
    await createPublicStorySubmissionMediaClearance(prisma, principal, {
      submissionId,
      clearanceType: value(formData, "clearanceType") as never,
      subjectId: value(formData, "subjectId") || null,
      mediaIds: [mediaId],
      dateObtained: optionalDate(formData, "dateObtained"),
      expiresAt: optionalDate(formData, "expiresAt"),
      evidenceType: (value(formData, "evidenceType") || null) as never,
      existingEvidenceReference:
        value(formData, "existingEvidenceReference") || null,
      existingEvidenceVersion:
        value(formData, "existingEvidenceVersion") || null,
      confidentialNote: value(formData, "confidentialNote") || null,
      websitePublicationAllowed: checked(formData, "websitePublicationAllowed"),
      socialMediaAllowed: checked(formData, "socialMediaAllowed"),
      printAllowed: checked(formData, "printAllowed"),
      fundraisingPromotionalAllowed: checked(
        formData,
        "fundraisingPromotionalAllowed",
      ),
      paidAdvertisingAllowed: checked(formData, "paidAdvertisingAllowed"),
      otherRestrictionsPresent: checked(formData, "otherRestrictionsPresent"),
      confidentialRestrictionsNote:
        value(formData, "confidentialRestrictionsNote") || null,
    });
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "clearance-created");
}

export async function setSubmissionMediaClearanceApplicabilityAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal(
      "communications.submissions.review",
    );
    await setPublicStorySubmissionMediaClearanceApplicability(
      prisma,
      principal,
      {
        clearanceId: value(formData, "clearanceId"),
        expectedClearanceVersion: expectedVersion(
          formData,
          "expectedClearanceVersion",
        ),
        mediaIds: formData
          .getAll("applicableMediaIds")
          .filter((item): item is string => typeof item === "string"),
      },
    );
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "applicability-updated");
}

export async function updateSubmissionMediaClearanceAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal(
      "communications.submissions.review",
    );
    await updatePublicStorySubmissionMediaClearance(prisma, principal, {
      clearanceId: value(formData, "clearanceId"),
      expectedClearanceVersion: expectedVersion(
        formData,
        "expectedClearanceVersion",
      ),
      dateObtained: optionalDate(formData, "dateObtained"),
      expiresAt: optionalDate(formData, "expiresAt"),
      evidenceType: (value(formData, "evidenceType") || null) as never,
      existingEvidenceReference:
        value(formData, "existingEvidenceReference") || null,
      existingEvidenceVersion:
        value(formData, "existingEvidenceVersion") || null,
      confidentialNote: value(formData, "confidentialNote") || null,
      websitePublicationAllowed: checked(formData, "websitePublicationAllowed"),
      socialMediaAllowed: checked(formData, "socialMediaAllowed"),
      printAllowed: checked(formData, "printAllowed"),
      fundraisingPromotionalAllowed: checked(
        formData,
        "fundraisingPromotionalAllowed",
      ),
      paidAdvertisingAllowed: checked(formData, "paidAdvertisingAllowed"),
      otherRestrictionsPresent: checked(formData, "otherRestrictionsPresent"),
      confidentialRestrictionsNote:
        value(formData, "confidentialRestrictionsNote") || null,
    });
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "clearance-updated");
}

export async function verifySubmissionMediaClearanceAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal(
      "communications.submissions.review",
    );
    await verifyPublicStorySubmissionMediaClearance(prisma, principal, {
      clearanceId: value(formData, "clearanceId"),
      expectedClearanceVersion: expectedVersion(
        formData,
        "expectedClearanceVersion",
      ),
      dateObtained: optionalDate(formData, "dateObtained"),
      evidenceDocumentId: value(formData, "evidenceDocumentId") || null,
    });
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "clearance-verified");
}

export async function rejectSubmissionMediaClearanceAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal(
      "communications.submissions.review",
    );
    await rejectPublicStorySubmissionMediaClearance(prisma, principal, {
      clearanceId: value(formData, "clearanceId"),
      expectedClearanceVersion: expectedVersion(
        formData,
        "expectedClearanceVersion",
      ),
    });
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "clearance-rejected");
}

export async function revokeSubmissionMediaClearanceAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal(
      "communications.submissions.review",
    );
    await revokePublicStorySubmissionMediaClearance(prisma, principal, {
      clearanceId: value(formData, "clearanceId"),
      expectedClearanceVersion: expectedVersion(
        formData,
        "expectedClearanceVersion",
      ),
      revocationReason: (value(formData, "revocationReason") ||
        "STAFF_REVIEW") as never,
    });
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "clearance-revoked");
}

export async function restrictSubmissionMediaAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal(
      "communications.submissions.review",
    );
    await restrictPublicStorySubmissionMedia(prisma, principal, {
      mediaId,
      reason: value(formData, "reason") as never,
      confidentialNote: value(formData, "confidentialNote") || null,
      expectedRestrictionVersion: value(formData, "expectedRestrictionVersion")
        ? expectedVersion(formData, "expectedRestrictionVersion")
        : null,
    });
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "media-restricted");
}

export async function restoreSubmissionMediaEligibilityAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal(
      "communications.media.restore_eligibility",
    );
    await restorePublicStorySubmissionMediaEligibility(prisma, principal, {
      mediaId,
      proposedUse: (value(formData, "proposedUse") ||
        "WEBSITE_PUBLICATION") as never,
      expectedRestrictionVersion: expectedVersion(
        formData,
        "expectedRestrictionVersion",
      ),
    });
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "eligibility-restored");
}

export async function promoteSubmissionMediaAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal("communications.media.promote");
    const privateStorage = getRuntimeSubmissionQuarantineStorage();
    const publicStorage = getRuntimePublicObjectStore();
    if (!privateStorage || !publicStorage)
      throw new Error("Media promotion storage is unavailable.");
    await promotePublicStorySubmissionMediaToLibrary(
      prisma,
      principal,
      privateStorage,
      publicStorage,
      {
        mediaId,
        expectedMediaVersion: expectedVersion(formData, "expectedMediaVersion"),
        creditTreatment: value(
          formData,
          "creditTreatment",
        ) as MediaAssetCreditTreatment,
        publicCredit: value(formData, "publicCredit") || null,
      },
    );
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "media-promoted");
}

export async function uploadSubmissionClearanceEvidenceAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal(
      "communications.submissions.review",
    );
    const storage = getRuntimeSubmissionClearanceEvidenceStorage();
    const file = formData.get("evidenceFile");
    const declaredMimeType = value(formData, "declaredMimeType");
    if (!storage || !(file instanceof File) || !file.size)
      throw new Error("Choose a clearance evidence file before uploading.");
    const environment = readServerEnvironment();
    const issued = await issuePublicStorySubmissionClearanceEvidenceUpload(
      prisma,
      principal,
      {
        clearanceId: value(formData, "clearanceId"),
        expectedClearanceVersion: expectedVersion(
          formData,
          "expectedClearanceVersion",
        ),
        declaredMimeType: declaredMimeType || file.type,
        originalFilename: file.name,
        replacesEvidenceDocumentId:
          value(formData, "replacesEvidenceDocumentId") || null,
        uploadAuthorizationSecret: environment.authSecret,
      },
    );
    await uploadPublicStorySubmissionClearanceEvidence(prisma, storage, {
      uploadAuthorization: issued.uploadAuthorization,
      uploadAuthorizationSecret: environment.authSecret,
      body: new Uint8Array(await file.arrayBuffer()),
      declaredMimeType: declaredMimeType || file.type,
    });
    await processPublicStorySubmissionClearanceEvidence(
      prisma,
      storage,
      principal,
      {
        evidenceDocumentId: issued.evidence.id,
        expectedEvidenceVersion: issued.evidence.version + 1,
      },
    );
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "evidence-uploaded");
}

export async function removeSubmissionClearanceEvidenceAction(
  _previousState: SubmissionMediaActionState | FormData,
  maybeFormData?: FormData,
): Promise<SubmissionMediaActionState> {
  const formData = actionFormData(_previousState, maybeFormData);
  const submissionId = value(formData, "submissionId");
  const mediaId = value(formData, "mediaId");
  try {
    const principal = await currentPrincipal(
      "communications.submissions.review",
    );
    const storage = getRuntimeSubmissionClearanceEvidenceStorage();
    if (!storage) throw new Error("Evidence storage is unavailable.");
    await removePublicStorySubmissionClearanceEvidence(
      prisma,
      storage,
      principal,
      {
        evidenceDocumentId: value(formData, "evidenceDocumentId"),
        expectedEvidenceVersion: expectedVersion(
          formData,
          "expectedEvidenceVersion",
        ),
      },
    );
  } catch (error) {
    return errorState(error);
  }
  redirectToMedia(submissionId, mediaId, "evidence-removed");
}

async function formAction(
  action: (formData: FormData) => Promise<SubmissionMediaActionState>,
  formData: FormData,
) {
  const result = await action(formData);
  if (result.status === "error") throw new Error(result.message);
}

export async function createSubmissionMediaSubjectFormAction(
  formData: FormData,
) {
  await formAction(createSubmissionMediaSubjectAction, formData);
}
export async function createSubmissionMediaClearanceFormAction(
  formData: FormData,
) {
  await formAction(createSubmissionMediaClearanceAction, formData);
}
export async function setSubmissionMediaClearanceApplicabilityFormAction(
  formData: FormData,
) {
  await formAction(setSubmissionMediaClearanceApplicabilityAction, formData);
}
export async function updateSubmissionMediaClearanceFormAction(
  formData: FormData,
) {
  await formAction(updateSubmissionMediaClearanceAction, formData);
}
export async function verifySubmissionMediaClearanceFormAction(
  formData: FormData,
) {
  await formAction(verifySubmissionMediaClearanceAction, formData);
}
export async function rejectSubmissionMediaClearanceFormAction(
  formData: FormData,
) {
  await formAction(rejectSubmissionMediaClearanceAction, formData);
}
export async function revokeSubmissionMediaClearanceFormAction(
  formData: FormData,
) {
  await formAction(revokeSubmissionMediaClearanceAction, formData);
}
export async function restrictSubmissionMediaFormAction(formData: FormData) {
  await formAction(restrictSubmissionMediaAction, formData);
}
export async function restoreSubmissionMediaEligibilityFormAction(
  formData: FormData,
) {
  await formAction(restoreSubmissionMediaEligibilityAction, formData);
}
export async function promoteSubmissionMediaFormAction(formData: FormData) {
  await formAction(promoteSubmissionMediaAction, formData);
}
export async function uploadSubmissionClearanceEvidenceFormAction(
  formData: FormData,
) {
  await formAction(uploadSubmissionClearanceEvidenceAction, formData);
}
export async function removeSubmissionClearanceEvidenceFormAction(
  formData: FormData,
) {
  await formAction(removeSubmissionClearanceEvidenceAction, formData);
}
