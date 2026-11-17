/**
 * Session configuration constants and helpers.
 */

export function getSessionInactivityTimeoutMs(): number {
  const envVal = process.env.SESSION_INACTIVITY_TIMEOUT_SECONDS;
  const seconds = envVal ? parseInt(envVal, 10) : 90;
  return (isNaN(seconds) || seconds <= 0 ? 90 : seconds) * 1000;
}
