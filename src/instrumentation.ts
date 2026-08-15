import { assertRuntimeEnvironment } from "@/platform/config/environment";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertRuntimeEnvironment();
  }
}
