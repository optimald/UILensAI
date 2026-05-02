/**
 * Admin Notification Service
 * Logs critical events (e.g., module failures) to console.
 * Email providers (Resend, SendGrid) were removed — this package is a standalone npm module.
 */

/**
 * Send admin notification (console-only).
 * Kept as a no-op for API compatibility with module-failure-handler.js.
 */
async function sendAdminEmail(subject, htmlBody, textBody = null) {
  console.warn(`[AdminNotification] ${subject}`);
  return { sent: false, reason: 'console_only' };
}

/**
 * Notify about module failure — logs to console.
 */
async function notifyModuleFailure(moduleName, jobId, url, error, isCritical = false) {
  const prefix = isCritical ? '🚨 CRITICAL' : '⚠️';
  console.warn(`[AdminNotification] ${prefix}: ${moduleName} module failed — Job ${jobId} — ${url}`);
  if (error?.message) {
    console.warn(`[AdminNotification]   Error: ${error.message}`);
  }
  return { sent: false, reason: 'console_only' };
}

module.exports = {
  sendAdminEmail,
  notifyModuleFailure
};
