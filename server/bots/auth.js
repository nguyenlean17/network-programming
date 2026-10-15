import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SCRYPT_BYTES = 64;

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new Error('Password must be 12–256 characters');
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_BYTES);
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, encodedSalt, encodedHash, extra] = String(stored).split('$');
  if (scheme !== 'scrypt' || !encodedSalt || !encodedHash || extra !== undefined) return false;
  try {
    const salt = Buffer.from(encodedSalt, 'base64url');
    const expected = Buffer.from(encodedHash, 'base64url');
    if (salt.length !== 16 || expected.length !== SCRYPT_BYTES) return false;
    const actual = Buffer.from(await scrypt(password, salt, SCRYPT_BYTES));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function signAccessToken(user, secret, now = Date.now()) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('AUTH_SECRET must contain at least 32 bytes');
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(now / 1000) + 60 * 60 * 12 })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyAccessToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048 || typeof secret !== 'string' || Buffer.byteLength(secret) < 32) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.sub !== 'string' || !Number.isInteger(data.exp) || data.exp <= Math.floor(now / 1000)) return null;
    return { userId: data.sub, expiresAt: data.exp };
  } catch {
    return null;
  }
}
