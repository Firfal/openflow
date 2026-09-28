import {
  addPagesToSnapshot,
  duePages,
  publishedAt,
  type ReleaseDoc,
  SCHEDULE_AUTHOR,
  type ScheduledPage,
  type Snapshot,
  SnapshotError,
} from "@openflow/core";

/**
 * Scheduled publication (`cmsScheduledPublish`, every quarter of an hour): the pages whose time
 * has come are added to the online site as they are, and nothing else (the owner's other drafts
 * stay drafts). The storage is behind {@link ScheduleStore} so the steps are tested without
 * Firebase.
 */
export interface ScheduleStore {
  /** Every page with a scheduled time (`publishAt`), due or not. */
  scheduledPages(): Promise<Array<{ id: string; publishAt?: string }>>;
  /** A publication is being built. */
  running(): Promise<boolean>;
  liveRelease(): Promise<ReleaseDoc | undefined>;
  loadSnapshot(path: string): Promise<Snapshot>;
  /** The pages as they are now (content, translations, optimized media). */
  loadPages(ids: string[]): Promise<ScheduledPage[]>;
  newReleaseId(): string;
  /**
   * Saves the snapshot and the release, then starts the build. Throws when the build does not
   * start (the release is then recorded as failed).
   */
  release(id: string, snapshot: Snapshot, release: Omit<ReleaseDoc, "snapshotPath">): Promise<void>;
  /** The pages are visible (`published`) and no longer scheduled. */
  markPublished(ids: string[]): Promise<void>;
}

export type ScheduleResult =
  | { done: "nothing" }
  /** A publication is being built: the pages go online at the next check. */
  | { done: "wait"; pages: string[] }
  /** The site was never published: the pages are visible from its first publication. */
  | { done: "visible"; pages: string[] }
  | { done: "published"; pages: string[]; releaseId: string }
  /** The pages could not go online: they are visible at the next publication. */
  | { done: "failed"; pages: string[]; error: string };

export async function publishScheduled(store: ScheduleStore, now: string): Promise<ScheduleResult> {
  const due = duePages(await store.scheduledPages(), now).map((page) => page.id);
  if (due.length === 0) return { done: "nothing" };
  if (await store.running()) return { done: "wait", pages: due };
  const live = await store.liveRelease();
  if (!live?.snapshotPath) {
    await store.markPublished(due);
    return { done: "visible", pages: due };
  }
  const pages = await store.loadPages(due);
  const ids = pages.map((page) => page.id);
  const releaseId = store.newReleaseId();
  try {
    const snapshot = addPagesToSnapshot(await store.loadSnapshot(live.snapshotPath), pages, {
      releaseId,
      createdAt: now,
    });
    await store.release(releaseId, snapshot, {
      status: "queued",
      createdAt: now,
      createdBy: SCHEDULE_AUTHOR,
      ...(live.sourcePath ? { sourcePath: live.sourcePath } : {}),
      builder: live.builder,
      pageCount: snapshot.pages.length,
      // The other pages are online as they were at the last publication.
      contentAt: publishedAt(live),
      scheduledPages: ids,
    });
  } catch (error) {
    // Never retried every quarter of an hour: the pages go online with the next publication.
    await store.markPublished(due);
    const message =
      error instanceof SnapshotError
        ? `${error.message} : ${error.details.join(" ; ")}`
        : (error as Error).message;
    return { done: "failed", pages: due, error: message };
  }
  await store.markPublished(due);
  return { done: "published", pages: ids, releaseId };
}
