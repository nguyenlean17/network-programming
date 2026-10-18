export function isDatabaseUnavailable(error) {
  return /^(08|53)/.test(error?.code || '') ||
    ['57P01', '57P02', '57P03', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(error?.code) ||
    /connection terminated|connection timeout|timeout exceeded when trying to connect/i.test(error?.message || '');
}

/** A disconnected idle pg client emits an error outside any request's try/catch. */
export function watchPoolErrors(pool, label, logger = console) {
  pool?.on('error', error => logger.error(`${label}: database connection lost`, error?.code || 'CONNECTION_ERROR'));
}

export async function rollbackQuietly(client) {
  if (!client) return;
  try { await client.query('ROLLBACK'); }
  catch { /* Preserve the original failure when the connection is already gone. */ }
}
