import type {
  Assessment,
  AssessmentAttempt,
  AssessmentRetakeRequest,
  Notification,
  NewNotification,
} from '../../db/types';
import { sendEmail } from '../../integrations/email';
import { studentsService } from '../students/students.service';
import { usersService } from '../users/users.service';
import { MAX_PAGE_SIZE } from '../../config/constants';
import { ForbiddenError, NotFoundError } from '../../shared/errors/app-error';
import { logger } from '../../logger';
import { notificationsRepository } from './notifications.repository';
import type { ListNotificationsQuery, NotificationIdParams } from './notifications.schema';
import type { ListNotificationsResult } from './notifications.types';

// --- Trigger points (item 6) & the fire-and-forget boundary (item 3) ---
//
// Every notify* function below is called from OUTSIDE this module —
// assessments.service.ts's publishAssessment, and attempts.service.ts's
// approveRetakeRequest/rejectRetakeRequest/submitAttempt — AFTER each of
// those functions has already committed its own state change. By the time
// any of these run, the triggering action has already succeeded; nothing
// in here is allowed to turn that into a failure.
//
// Two layers of defense, both deliberate, not redundant-by-accident:
//   1. Each notify* function's own body is wrapped in try/catch — a
//      failure resolving recipients, inserting notification rows, or
//      sending email is logged and swallowed HERE, never thrown out of
//      this module.
//   2. The four call sites (see assessments.service.ts / attempts.service.ts)
//      additionally call these functions WITHOUT awaiting them
//      (`void notificationsService.notifyX(...).catch(...)`) — so even a
//      bug in this file that somehow throws synchronously, or a promise
//      that rejects despite (1), can never delay or affect the caller's
//      return value or throw path.
//
// Email specifically gets a THIRD layer: dispatchEmails below catches
// per-recipient, so one bad email address or a mid-batch Resend outage
// doesn't stop the in-app notification rows (already inserted before any
// email is attempted) or the remaining recipients' emails.
//
// --- Known limitation (item 4) ---
//
// This is synchronous, in-request fire-and-forget, NOT a durable job
// queue — jobs/ is still stub infrastructure (scheduler.ts has nothing to
// enqueue into), and events/event-bus.ts is likewise an empty stub, which
// is why these are called as direct function calls rather than published
// events. If the Node process crashes between the triggering action
// committing and this code finishing, the notification/email for that
// event is silently lost — there is no retry, no outbox table, no at-
// least-once guarantee. Acceptable for this phase because the alternative
// (blocking the triggering request on notification delivery, or building
// a real queue) is explicitly out of scope; a future phase should route
// these through a real queue via jobs/scheduler.ts instead of calling
// notify* directly from other modules' services.

// --- Cross-module reads (item 6) ---
//
// notifyAssessmentPublished takes batchIds as a parameter rather than
// resolving them itself via assessmentsService — deliberately, to avoid a
// circular import (assessments.service.ts already needs to import THIS
// module to fire the notification; this module importing
// assessmentsService back would create assessments <-> notifications
// import cycle). publishAssessment already has the assessment id in hand
// and assessments.repository.ts's listAssessmentBatchIds is a one-line
// call from inside that same module, so passing the resolved list in is
// both cycle-free and avoids a redundant re-fetch. studentsService and
// usersService are still called directly from here — neither of those
// modules imports notifications.service.ts back, so no cycle there.
async function listAllStudentUserIdsForBatches(batchIds: string[]): Promise<string[]> {
  const userIds = new Set<string>();

  for (const batchId of batchIds) {
    let page = 1;
    // Reuses studentsService.listStudentProfiles (students.repository.ts's
    // existing batch-join query) rather than writing a new "all students in
    // a batch" repository query — same boundary-rule + no-duplicated-
    // query-logic discipline as every other cross-module call in this
    // codebase. Paged through MAX_PAGE_SIZE at a time since that service
    // function is paginated and there's no "give me everything" variant.
    for (;;) {
      const { items } = await studentsService.listStudentProfiles({
        batchId,
        includeArchived: false,
        page,
        pageSize: MAX_PAGE_SIZE,
      });
      for (const profile of items) {
        userIds.add(profile.userId);
      }
      if (items.length < MAX_PAGE_SIZE) {
        break;
      }
      page += 1;
    }
  }

  return [...userIds];
}

async function dispatchEmails(
  rows: Notification[],
  subject: string,
  bodyText: string,
): Promise<void> {
  await Promise.all(
    rows.map(async (row) => {
      try {
        const user = await usersService.findById(row.recipientId);
        await sendEmail({ to: user.email, subject, html: `<p>${bodyText}</p>` });
      } catch (err) {
        // Per-recipient catch — a down Resend, a missing RESEND_API_KEY, or
        // one bad recipient must never stop the rest of the batch, and
        // must never propagate into notifyX's own try/catch as something
        // worth logging twice. The in-app notification row for this
        // recipient was already inserted before this ran and is
        // unaffected either way.
        logger.error(
          { err, recipientId: row.recipientId, notificationId: row.id },
          'Failed to send notification email',
        );
      }
    }),
  );
}

async function notifyAssessmentPublished(
  assessment: Assessment,
  batchIds: string[],
): Promise<void> {
  try {
    const recipientUserIds = await listAllStudentUserIdsForBatches(batchIds);
    if (recipientUserIds.length === 0) {
      return;
    }

    const title = `New assessment published: ${assessment.title}`;
    const body = `"${assessment.title}" is now live. You can start your attempt from the assessments list.`;

    const data: NewNotification[] = recipientUserIds.map((recipientId) => ({
      recipientId,
      type: 'assessment_published',
      title,
      body,
      relatedEntityType: 'assessment',
      relatedEntityId: assessment.id,
    }));

    const rows = await notificationsRepository.createNotifications(data);
    await dispatchEmails(rows, title, body);
  } catch (err) {
    logger.error(
      { err, assessmentId: assessment.id },
      'Failed to send assessment-published notifications',
    );
  }
}

async function notifyRetakeRequestReviewed(
  retakeRequest: AssessmentRetakeRequest,
): Promise<void> {
  try {
    // requested_by is ON DELETE SET NULL (attempts.schema.ts) — if the
    // requesting user's account no longer exists, there's no one left to
    // notify.
    if (!retakeRequest.requestedBy) {
      return;
    }

    const approved = retakeRequest.status === 'approved';
    const title = approved ? 'Retake request approved' : 'Retake request rejected';
    const body = approved
      ? 'Your retake request has been approved. You may now start a new attempt.'
      : 'Your retake request has been rejected.';

    const rows = await notificationsRepository.createNotifications([
      {
        recipientId: retakeRequest.requestedBy,
        type: approved ? 'retake_request_approved' : 'retake_request_rejected',
        title,
        body,
        relatedEntityType: 'retake_request',
        relatedEntityId: retakeRequest.id,
      },
    ]);

    await dispatchEmails(rows, title, body);
  } catch (err) {
    logger.error(
      { err, retakeRequestId: retakeRequest.id },
      'Failed to send retake-request-reviewed notification',
    );
  }
}

// Only called by submitAttempt when the resulting status is 'submitted' —
// see attempts.service.ts's own comment on that gate. This function trusts
// its caller on that; it does not re-check attempt.status itself.
async function notifyAttemptFinalized(
  attempt: AssessmentAttempt,
  recipientUserId: string,
): Promise<void> {
  try {
    const title = 'Your assessment score is ready';
    const scoreText = attempt.totalScore !== null ? ` Your score: ${attempt.totalScore}.` : '';
    const body = `Your attempt has been finalized.${scoreText} View the details in your reports.`;

    const rows = await notificationsRepository.createNotifications([
      {
        recipientId: recipientUserId,
        type: 'attempt_finalized',
        title,
        body,
        relatedEntityType: 'attempt',
        relatedEntityId: attempt.id,
      },
    ]);

    await dispatchEmails(rows, title, body);
  } catch (err) {
    logger.error({ err, attemptId: attempt.id }, 'Failed to send attempt-finalized notification');
  }
}

// --- Self-service reads (item 5) ---
//
// Self-scoped, same precedent as reports.service.ts's listMyAttempts /
// getMyAttemptDetail: no permission key, authorization is "this row's
// recipient_id is the caller," enforced here rather than via RBAC.

async function listMyNotifications(
  userId: string,
  query: ListNotificationsQuery,
): Promise<ListNotificationsResult> {
  const { items, total } = await notificationsRepository.listNotifications({
    recipientId: userId,
    isRead: query.isRead,
    page: query.page,
    pageSize: query.pageSize,
  });
  return { items, total, page: query.page, pageSize: query.pageSize };
}

async function markNotificationRead(
  userId: string,
  id: NotificationIdParams['id'],
): Promise<Notification> {
  const existing = await notificationsRepository.findNotificationById(id);
  if (!existing) {
    throw new NotFoundError('Notification not found');
  }
  if (existing.recipientId !== userId) {
    throw new ForbiddenError('You can only mark your own notifications as read');
  }

  const updated = await notificationsRepository.markAsRead(id);
  if (!updated) {
    throw new NotFoundError('Notification not found');
  }
  return updated;
}

export const notificationsService = {
  notifyAssessmentPublished,
  notifyRetakeRequestReviewed,
  notifyAttemptFinalized,
  listMyNotifications,
  markNotificationRead,
};
