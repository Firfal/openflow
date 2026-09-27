import { describe, expect, it } from "vitest";
import {
  BUILDER_ROLES,
  missingBindings,
  REQUIRED_SERVICES,
  withBindings,
} from "../src/commands/setup.js";

describe("openflow setup", () => {
  const builder = "serviceAccount:cms-builder@p.iam.gserviceaccount.com";
  const runtime = "serviceAccount:1-compute@developer.gserviceaccount.com";

  it("adds only the missing roles, and never removes a member", () => {
    const bindings = [
      { role: "roles/firebasehosting.admin", members: [builder, "user:agence@exemple.fr"] },
      { role: "roles/editor", members: [runtime] },
    ];
    const missing = missingBindings(bindings, [
      { member: builder, roles: BUILDER_ROLES },
      { member: runtime, roles: ["roles/cloudbuild.builds.editor"] },
    ]);
    expect(missing).toEqual([
      ...BUILDER_ROLES.filter((r) => r !== "roles/firebasehosting.admin").map((role) => ({
        role,
        member: builder,
      })),
      { role: "roles/cloudbuild.builds.editor", member: runtime },
    ]);
    const next = withBindings(bindings, missing);
    expect(next.find((b) => b.role === "roles/firebasehosting.admin")?.members).toEqual([
      builder,
      "user:agence@exemple.fr",
    ]);
    expect(next.find((b) => b.role === "roles/editor")?.members).toEqual([runtime]);
    expect(missingBindings(next, [{ member: builder, roles: BUILDER_ROLES }])).toEqual([]);
    // The input is left untouched.
    expect(bindings[0]!.members).toHaveLength(2);
  });

  it("adds a member to an existing unconditional binding rather than duplicating it", () => {
    const next = withBindings(
      [{ role: "roles/logging.logWriter", members: ["user:a@b.fr"] }],
      [{ role: "roles/logging.logWriter", member: builder }],
    );
    expect(next).toEqual([{ role: "roles/logging.logWriter", members: ["user:a@b.fr", builder] }]);
  });

  it("enables every API the functions, builds, backups and alerts need", () => {
    for (const api of ["cloudbuild", "run", "firestore", "monitoring", "identitytoolkit"]) {
      expect(REQUIRED_SERVICES).toContain(`${api}.googleapis.com`);
    }
  });
});
