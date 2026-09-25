import { describe, expect, it } from "vitest";
import {
  buildRequest,
  formerOwners,
  isOwnerToken,
  ownerDecision,
  parseOwners,
  releaseStatusFromBuild,
  snapshotPath,
} from "../src/core.js";

describe("owner", () => {
  it("parses owner emails", () => {
    expect(parseOwners(" Client@Exemple.fr, autre@x.fr;b@y.fr ")).toEqual([
      "client@exemple.fr",
      "autre@x.fr",
      "b@y.fr",
    ]);
    expect(parseOwners(undefined)).toEqual([]);
  });

  it("finds the accounts that kept the claim after an owner change", () => {
    const users = [
      { email: "ancien@exemple.fr", customClaims: { of_owner: true, autre: 1 } },
      { email: "Nouveau@exemple.fr", customClaims: { of_owner: true } },
      { email: "visiteur@exemple.fr" },
    ];
    expect(formerOwners(users, ["nouveau@exemple.fr"]).map((u) => u.email)).toEqual([
      "ancien@exemple.fr",
    ]);
    // No owner configured: nothing is revoked (the functions refuse everyone anyway).
    expect(formerOwners(users, [])).toEqual([]);
  });

  it("only accepts the configured, verified email", () => {
    const owners = ["client@exemple.fr"];
    expect(
      ownerDecision({ email: "CLIENT@exemple.fr", email_verified: true }, owners, false),
    ).toEqual({ ok: true });
    expect(
      ownerDecision({ email: "pirate@x.fr", email_verified: true }, owners, false),
    ).toMatchObject({ ok: false, code: "permission-denied" });
    expect(
      ownerDecision({ email: "client@exemple.fr", email_verified: false }, owners, false),
    ).toMatchObject({ ok: false, code: "permission-denied" });
    expect(
      ownerDecision({ email: "client@exemple.fr", email_verified: false }, owners, true),
    ).toEqual({ ok: true });
    expect(
      ownerDecision({ email: "client@exemple.fr", email_verified: true }, [], false),
    ).toMatchObject({ ok: false, code: "failed-precondition" });
  });

  it("requires the claim and a still-configured email", () => {
    expect(isOwnerToken({ email: "a@x.fr", of_owner: true }, ["a@x.fr"])).toBe(true);
    expect(isOwnerToken({ email: "a@x.fr" }, ["a@x.fr"])).toBe(false);
    expect(isOwnerToken({ email: "old@x.fr", of_owner: true }, ["new@x.fr"])).toBe(false);
    expect(isOwnerToken(undefined, ["a@x.fr"])).toBe(false);
  });
});

describe("cloud build", () => {
  it("builds from the source archive with the frozen snapshot, then deploys hosting", () => {
    const request = buildRequest({
      projectId: "mon-site",
      bucket: "mon-site.firebasestorage.app",
      sourcePath: "openflow/source/abc.tgz",
      snapshotPath: snapshotPath("R1"),
      releaseId: "R1",
      serviceAccount: "openflow-builder@mon-site.iam.gserviceaccount.com",
    });
    expect(request.source.storageSource).toEqual({
      bucket: "mon-site.firebasestorage.app",
      object: "openflow/source/abc.tgz",
    });
    expect(request.steps.map((step) => step.id)).toEqual([
      "snapshot",
      "install",
      "build",
      "deploy",
    ]);
    expect(request.steps[0]!.args).toContain(
      "gs://mon-site.firebasestorage.app/openflow/snapshots/R1.json",
    );
    expect(request.steps[2]!.env).toContain("OPENFLOW_SNAPSHOT=openflow/.snapshot.json");
    expect(request.steps[3]!.args).toEqual(
      expect.arrayContaining(["deploy", "--only", "hosting", "--project", "mon-site"]),
    );
    expect(request.substitutions).toEqual({ _OPENFLOW_RELEASE_ID: "R1" });
    // Cloud Build rejects a substitution no step uses, unless the option is loose.
    expect(request.options.substitutionOption).toBe("ALLOW_LOOSE");
    expect(request.serviceAccount).toBe(
      "projects/mon-site/serviceAccounts/openflow-builder@mon-site.iam.gserviceaccount.com",
    );
  });

  it("maps Cloud Build statuses to release statuses", () => {
    expect(releaseStatusFromBuild({ status: "QUEUED" })).toBe("queued");
    expect(releaseStatusFromBuild({ status: "WORKING" })).toBe("building");
    expect(releaseStatusFromBuild({ status: "SUCCESS" })).toBe("live");
    expect(releaseStatusFromBuild({ status: "TIMEOUT" })).toBe("failed");
    expect(releaseStatusFromBuild({ status: "STATUS_UNKNOWN" })).toBeUndefined();
  });
});
