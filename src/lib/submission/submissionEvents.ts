/**
 * FormCraft - Submission Event Synchronization Utilities
 * Bridges submission events across tabs, windows, and editor state via BroadcastChannel and Storage events.
 */

export const SUBMISSION_BROADCAST_CHANNEL = 'formcraft_submissions';
export const SUBMISSION_STORAGE_KEY = 'formcraft_last_submission';

export interface SubmissionEventPayload {
  type: 'FORM_SUBMITTED';
  publicId?: string;
  formId?: string;
  submissionId?: string;
  timestamp: number;
}

/**
 * Notifies listening editor tabs and response viewers that a form was successfully submitted.
 * Called only after confirmed successful submission persistence from the backend.
 */
export function notifyFormSubmitted(publicId: string, formId?: string, submissionId?: string) {
  const payload: SubmissionEventPayload = {
    type: 'FORM_SUBMITTED',
    publicId,
    formId,
    submissionId,
    timestamp: Date.now(),
  };

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(SUBMISSION_BROADCAST_CHANNEL);
      channel.postMessage(payload);
      channel.close();
    }
  } catch {}

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {}
}

