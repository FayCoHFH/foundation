// Schema-affecting Better Auth options live here so the runtime configuration
// and the CLI-only scratch generator cannot drift.
export const AUTH_SCHEMA_OPTIONS = {
  user: {
    additionalFields: {
      workspaceDomain: {
        type: "string" as const,
        required: false,
        input: false,
      },
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database" as const,
  },
};
