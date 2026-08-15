-- CreateEnum
CREATE TYPE "AdminUserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ExternalIdentityProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCEEDED', 'DENIED', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditActorKind" AS ENUM ('ADMIN_USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "workspaceDomain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user" (
    "id" UUID NOT NULL,
    "authUserId" TEXT NOT NULL,
    "status" "AdminUserStatus" NOT NULL DEFAULT 'INVITED',
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identity" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "authUserId" TEXT NOT NULL,
    "authAccountId" TEXT NOT NULL,
    "provider" "ExternalIdentityProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL,
    "hostedDomain" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAuthenticatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "grantedById" UUID,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedById" UUID,
    "sourceInvitationId" UUID,
    "revokedAt" TIMESTAMP(3),
    "assignmentReason" TEXT,
    "revocationReason" TEXT,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_invitation" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "tokenDigest" CHAR(64) NOT NULL,
    "hostedDomain" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "createdById" UUID,
    "isSuperAdminBootstrap" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_invitation_role" (
    "invitationId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "admin_invitation_role_pkey" PRIMARY KEY ("invitationId","roleId")
);

-- CreateTable
CREATE TABLE "super_admin_grant" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "grantedById" UUID,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,

    CONSTRAINT "super_admin_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorAdminUserId" UUID,
    "actorKind" "AuditActorKind" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "outcome" "AuditOutcome" NOT NULL,
    "correlationId" UUID NOT NULL,
    "summary" JSONB NOT NULL,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- Application invariants Prisma cannot express. These checks deliberately
-- make the Google-only identity and token non-retention policies fail closed.
ALTER TABLE "user"
  ADD CONSTRAINT "user_email_normalized_check"
    CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "user_workspace_domain_normalized_check"
    CHECK ("workspaceDomain" IS NULL OR "workspaceDomain" = lower(btrim("workspaceDomain")));

ALTER TABLE "session"
  ADD CONSTRAINT "session_minimized_metadata_check"
    CHECK ("ipAddress" IS NULL AND "userAgent" IS NULL);

ALTER TABLE "account"
  ADD CONSTRAINT "account_google_only_check"
    CHECK ("providerId" = 'google'),
  ADD CONSTRAINT "account_subject_present_check"
    CHECK (length(btrim("accountId")) > 0),
  ADD CONSTRAINT "account_no_provider_credentials_check"
    CHECK (
      "accessToken" IS NULL
      AND "refreshToken" IS NULL
      AND "idToken" IS NULL
      AND "accessTokenExpiresAt" IS NULL
      AND "refreshTokenExpiresAt" IS NULL
      AND "password" IS NULL
    );

ALTER TABLE "admin_user"
  ADD CONSTRAINT "admin_user_status_timestamps_check"
    CHECK (
      ("status" IN ('INVITED', 'ACTIVE') AND "suspendedAt" IS NULL AND "revokedAt" IS NULL)
      OR ("status" = 'SUSPENDED' AND "suspendedAt" IS NOT NULL AND "revokedAt" IS NULL)
      OR ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)
    ),
  ADD CONSTRAINT "admin_user_version_positive_check" CHECK ("version" > 0);

ALTER TABLE "external_identity"
  ADD CONSTRAINT "external_identity_verified_google_check"
    CHECK ("provider" = 'GOOGLE' AND "emailVerified" = true AND length(btrim("subject")) > 0),
  ADD CONSTRAINT "external_identity_email_normalized_check"
    CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "external_identity_domain_normalized_check"
    CHECK ("hostedDomain" = lower(btrim("hostedDomain")));

ALTER TABLE "role"
  ADD CONSTRAINT "role_key_format_check" CHECK ("key" ~ '^[a-z][a-z0-9._-]*$'),
  ADD CONSTRAINT "role_version_positive_check" CHECK ("version" > 0);

ALTER TABLE "permission"
  ADD CONSTRAINT "permission_key_format_check" CHECK ("key" ~ '^[a-z][a-z0-9._-]*$');

ALTER TABLE "user_role"
  ADD CONSTRAINT "user_role_revocation_check"
    CHECK ("revokedAt" IS NULL OR "revocationReason" IS NOT NULL);

ALTER TABLE "admin_invitation"
  ADD CONSTRAINT "admin_invitation_email_normalized_check"
    CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "admin_invitation_domain_normalized_check"
    CHECK ("hostedDomain" = lower(btrim("hostedDomain"))),
  ADD CONSTRAINT "admin_invitation_digest_check"
    CHECK ("tokenDigest" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "admin_invitation_expiry_check" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "admin_invitation_version_positive_check" CHECK ("version" > 0),
  ADD CONSTRAINT "admin_invitation_lifecycle_check"
    CHECK (
      ("status" IN ('PENDING', 'EXPIRED') AND "acceptedAt" IS NULL AND "acceptedById" IS NULL AND "revokedAt" IS NULL AND "revokedById" IS NULL)
      OR ("status" = 'ACCEPTED' AND "acceptedAt" IS NOT NULL AND "acceptedById" IS NOT NULL AND "revokedAt" IS NULL AND "revokedById" IS NULL)
      OR ("status" = 'REVOKED' AND "acceptedAt" IS NULL AND "acceptedById" IS NULL AND "revokedAt" IS NOT NULL)
    );

ALTER TABLE "super_admin_grant"
  ADD CONSTRAINT "super_admin_reason_check" CHECK (length(btrim("reason")) >= 12);

ALTER TABLE "audit_event"
  ADD CONSTRAINT "audit_actor_consistency_check"
    CHECK (
      ("actorKind" = 'ADMIN_USER' AND "actorAdminUserId" IS NOT NULL)
      OR ("actorKind" = 'SYSTEM' AND "actorAdminUserId" IS NULL)
    );

CREATE UNIQUE INDEX "admin_invitation_one_pending_per_email_key"
  ON "admin_invitation" ("email")
  WHERE "status" = 'PENDING' AND "acceptedAt" IS NULL AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX "admin_invitation_one_super_admin_bootstrap_key"
  ON "admin_invitation" ("isSuperAdminBootstrap")
  WHERE "isSuperAdminBootstrap" = true AND "status" = 'PENDING' AND "acceptedAt" IS NULL AND "revokedAt" IS NULL;

-- Audit events are append-only at the database boundary. G-05 must provision
-- the application role with INSERT/SELECT only; this trigger also protects
-- against accidental writes if broader table privileges are introduced later.
CREATE FUNCTION "prevent_audit_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_event rows are append-only';
END;
$$;

CREATE TRIGGER "audit_event_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "audit_event"
FOR EACH ROW EXECUTE FUNCTION "prevent_audit_event_mutation"();

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "account_userId_providerId_key" ON "account"("userId", "providerId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "verification_expiresAt_idx" ON "verification"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_authUserId_key" ON "admin_user"("authUserId");

-- CreateIndex
CREATE INDEX "admin_user_status_idx" ON "admin_user"("status");

-- CreateIndex
CREATE UNIQUE INDEX "external_identity_authUserId_key" ON "external_identity"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "external_identity_authAccountId_key" ON "external_identity"("authAccountId");

-- CreateIndex
CREATE INDEX "external_identity_adminUserId_idx" ON "external_identity"("adminUserId");

-- CreateIndex
CREATE INDEX "external_identity_authUserId_idx" ON "external_identity"("authUserId");

-- CreateIndex
CREATE INDEX "external_identity_authAccountId_idx" ON "external_identity"("authAccountId");

-- CreateIndex
CREATE INDEX "external_identity_email_idx" ON "external_identity"("email");

-- CreateIndex
CREATE UNIQUE INDEX "external_identity_provider_subject_key" ON "external_identity"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "external_identity_adminUserId_provider_key" ON "external_identity"("adminUserId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permission_key_key" ON "permission"("key");

-- CreateIndex
CREATE INDEX "role_permission_permissionId_idx" ON "role_permission"("permissionId");

-- CreateIndex
CREATE INDEX "user_role_roleId_idx" ON "user_role"("roleId");

-- CreateIndex
CREATE INDEX "user_role_grantedById_idx" ON "user_role"("grantedById");

-- CreateIndex
CREATE INDEX "user_role_revokedById_idx" ON "user_role"("revokedById");

-- CreateIndex
CREATE INDEX "user_role_sourceInvitationId_idx" ON "user_role"("sourceInvitationId");

-- CreateIndex
CREATE INDEX "user_role_adminUserId_revokedAt_idx" ON "user_role"("adminUserId", "revokedAt");

-- CreateIndex
CREATE INDEX "user_role_adminUserId_roleId_idx" ON "user_role"("adminUserId", "roleId");

-- Only one effective assignment for a role may exist at once. Revoked rows are
-- retained so a later explicit regrant creates new audit/history evidence.
CREATE UNIQUE INDEX "user_role_one_active_role_key"
  ON "user_role" ("adminUserId", "roleId")
  WHERE "revokedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "admin_invitation_tokenDigest_key" ON "admin_invitation"("tokenDigest");

-- CreateIndex
CREATE INDEX "admin_invitation_email_status_idx" ON "admin_invitation"("email", "status");

-- CreateIndex
CREATE INDEX "admin_invitation_expiresAt_idx" ON "admin_invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "admin_invitation_createdById_idx" ON "admin_invitation"("createdById");

-- CreateIndex
CREATE INDEX "admin_invitation_acceptedById_idx" ON "admin_invitation"("acceptedById");

-- CreateIndex
CREATE INDEX "admin_invitation_revokedById_idx" ON "admin_invitation"("revokedById");

-- CreateIndex
CREATE INDEX "admin_invitation_role_roleId_idx" ON "admin_invitation_role"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_grant_adminUserId_key" ON "super_admin_grant"("adminUserId");

-- CreateIndex
CREATE INDEX "super_admin_grant_grantedById_idx" ON "super_admin_grant"("grantedById");

-- CreateIndex
CREATE INDEX "audit_event_occurredAt_idx" ON "audit_event"("occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_actorAdminUserId_occurredAt_idx" ON "audit_event"("actorAdminUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_action_occurredAt_idx" ON "audit_event"("action", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_event_targetType_targetId_idx" ON "audit_event"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "audit_event_correlationId_idx" ON "audit_event"("correlationId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user" ADD CONSTRAINT "admin_user_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identity" ADD CONSTRAINT "external_identity_authAccountId_fkey" FOREIGN KEY ("authAccountId") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_sourceInvitationId_fkey" FOREIGN KEY ("sourceInvitationId") REFERENCES "admin_invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invitation" ADD CONSTRAINT "admin_invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invitation" ADD CONSTRAINT "admin_invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invitation" ADD CONSTRAINT "admin_invitation_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invitation_role" ADD CONSTRAINT "admin_invitation_role_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "admin_invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invitation_role" ADD CONSTRAINT "admin_invitation_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_grant" ADD CONSTRAINT "super_admin_grant_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_grant" ADD CONSTRAINT "super_admin_grant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actorAdminUserId_fkey" FOREIGN KEY ("actorAdminUserId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
