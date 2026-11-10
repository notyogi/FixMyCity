import { Prisma, ReputationEvent, ReputationReason } from '@prisma/client';
import prisma from '../utils/prisma';
import { getReputationConfig, getReputationLevel, ReputationLevel } from '../config/reputation.config';

export interface ReputationEventInput {
  userId: string;
  reportId: string;
  reason: ReputationReason;
  relatedUserId?: string | null;
}

export interface UserReputationSummary {
  score: number;
  level: ReputationLevel;
  recent_events: ReputationEvent[];
}

/**
 * Computes the deterministic idempotency key for a reputation event.
 * Format: `${reason}:${report_id}:${related_user_id ?? ""}`
 */
export function buildReputationDedupeKey(
  reason: ReputationReason,
  reportId: string,
  relatedUserId?: string | null
): string {
  return `${reason}:${reportId}:${relatedUserId ?? ''}`;
}

/**
 * Resolves point delta for a given ReputationReason from config/env.
 */
export function getDeltaForReason(reason: ReputationReason): number {
  const cfg = getReputationConfig();
  switch (reason) {
    case ReputationReason.REPORT_FIXED:
      return cfg.fixedDelta;
    case ReputationReason.REPORT_REJECTED_SPAM:
      return cfg.rejectedDelta;
    case ReputationReason.CONFIRMED_BY_OTHER:
      return cfg.confirmedDelta;
  }
}

export class ReputationService {
  /**
   * Idempotently applies reputation events inside the caller's Prisma transaction.
   *
   * Idempotency & Concurrency Guarantees:
   * 1. Computes deterministic dedupe keys (`${reason}:${reportId}:${relatedUserId ?? ""}`).
   * 2. Pre-filters existing keys via `findMany` to avoid unnecessary writes.
   * 3. Uses `createManyAndReturn` with `skipDuplicates: true` (PostgreSQL ON CONFLICT DO NOTHING RETURNING *)
   *    so even if two parallel transactions pass the `findMany` check simultaneously, only the winning
   *    transaction receives the inserted row and increments `users.reputation_score`.
   * 4. Aggregates net delta per user (one atomic `{ increment }` update per affected user, sorted by userId
   *    to avoid lock-order deadlocks).
   *
   * @returns List of ReputationEvent records actually inserted/applied in this transaction.
   */
  static async applyReputationEvents(
    tx: Prisma.TransactionClient,
    events: ReputationEventInput[]
  ): Promise<ReputationEvent[]> {
    if (!events || events.length === 0) {
      return [];
    }

    // Build normalized candidate rows & deduplicate within this batch by dedupe_key
    const candidateMap = new Map<
      string,
      {
        user_id: string;
        report_id: string;
        reason: ReputationReason;
        delta: number;
        related_user_id: string | null;
        dedupe_key: string;
      }
    >();

    for (const ev of events) {
      const relatedUserId = ev.relatedUserId ?? null;
      const dedupeKey = buildReputationDedupeKey(ev.reason, ev.reportId, relatedUserId);
      if (!candidateMap.has(dedupeKey)) {
        candidateMap.set(dedupeKey, {
          user_id: ev.userId,
          report_id: ev.reportId,
          reason: ev.reason,
          delta: getDeltaForReason(ev.reason),
          related_user_id: relatedUserId,
          dedupe_key: dedupeKey,
        });
      }
    }

    const dedupeKeys = Array.from(candidateMap.keys());
    if (dedupeKeys.length === 0) {
      return [];
    }

    // Load existing dedupe keys first
    const existingRows = await tx.reputationEvent.findMany({
      where: {
        dedupe_key: { in: dedupeKeys },
      },
      select: {
        dedupe_key: true,
      },
    });

    const existingSet = new Set(existingRows.map((r) => r.dedupe_key));
    const eventsToCreate = Array.from(candidateMap.values()).filter(
      (row) => !existingSet.has(row.dedupe_key)
    );

    if (eventsToCreate.length === 0) {
      return [];
    }

    // Insert atomically with ON CONFLICT DO NOTHING RETURNING * so parallel requests cannot double-award
    const insertedEvents = await tx.reputationEvent.createManyAndReturn({
      data: eventsToCreate,
      skipDuplicates: true,
    });

    if (insertedEvents.length === 0) {
      return [];
    }

    // Sum net delta per affected user (strictly from actually-inserted events)
    const userDeltas = new Map<string, number>();
    for (const inserted of insertedEvents) {
      userDeltas.set(inserted.user_id, (userDeltas.get(inserted.user_id) || 0) + inserted.delta);
    }

    // Update each user once in deterministic ID order to avoid lock contention / deadlocks
    const sortedUserIds = Array.from(userDeltas.keys()).sort();
    for (const userId of sortedUserIds) {
      const totalDelta = userDeltas.get(userId) || 0;
      if (totalDelta !== 0) {
        await tx.user.update({
          where: { id: userId },
          data: {
            reputation_score: { increment: totalDelta },
          },
        });
      }
    }

    return insertedEvents;
  }

  /**
   * Returns current score, tier level, and the 20 most recent reputation events for a user.
   */
  static async getReputationForUser(userId: string): Promise<UserReputationSummary> {
    const [user, recentEvents] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { reputation_score: true },
      }),
      prisma.reputationEvent.findMany({
        where: { user_id: userId },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
    ]);

    const score = user?.reputation_score ?? 0;

    return {
      score,
      level: getReputationLevel(score),
      recent_events: recentEvents,
    };
  }
}

export const applyReputationEvents = ReputationService.applyReputationEvents;
export const getReputationForUser = ReputationService.getReputationForUser;

