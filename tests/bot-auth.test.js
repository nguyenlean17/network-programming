import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, signAccessToken, verifyAccessToken } from '../server/bots/auth.js';

const password = 'correct horse battery staple';
const digest = await hashPassword(password);
assert.equal(await verifyPassword(password, digest), true);
assert.equal(await verifyPassword('wrong password here', digest), false);
await assert.rejects(hashPassword('too short'));
const secret = 't'.repeat(48);
const issued = signAccessToken({ id: 'user-123' }, secret, 1_000_000);
assert.deepEqual(verifyAccessToken(issued, secret, 1_001_000), { userId: 'user-123', expiresAt: 44200 });
assert.equal(verifyAccessToken(issued, secret, 50_000_000), null);
assert.equal(verifyAccessToken(`${issued}x`, secret, 1_001_000), null);
assert.equal(verifyAccessToken(issued, 'short', 1_001_000), null);
console.log('✓ Password hashes and signed token expiry/tamper checks');
