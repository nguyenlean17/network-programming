import { inflateRawSync } from 'node:zlib';

export const MAX_SOURCE_BYTES = 64 * 1024;
export const MAX_ARCHIVE_BYTES = 128 * 1024;

const crcTable = new Uint32Array(256);
for (let value = 0; value < 256; value++) {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  crcTable[value] = crc >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function archiveError(message) { return Object.assign(new Error(message), { status: 400 }); }

/** Extract only one root-level main.py entry; reject paths, extra files and oversized content. */
export function extractMainPythonFromZip(archive) {
  if (!Buffer.isBuffer(archive) || archive.length < 22 || archive.length > MAX_ARCHIVE_BYTES) {
    throw archiveError('ZIP archive must be between 22 bytes and 128 KiB');
  }
  const minOffset = Math.max(0, archive.length - 22 - 0xffff);
  let endOffset = -1;
  for (let offset = archive.length - 22; offset >= minOffset; offset--) {
    if (archive.readUInt32LE(offset) === 0x06054b50 && offset + 22 + archive.readUInt16LE(offset + 20) === archive.length) {
      endOffset = offset; break;
    }
  }
  if (endOffset < 0) throw archiveError('ZIP end record is missing or invalid');
  if (archive.readUInt16LE(endOffset + 4) !== 0 || archive.readUInt16LE(endOffset + 6) !== 0) {
    throw archiveError('Multi-disk ZIP archives are not supported');
  }
  const entries = archive.readUInt16LE(endOffset + 10);
  const entriesOnDisk = archive.readUInt16LE(endOffset + 8);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  if (entries !== 1 || entriesOnDisk !== 1 || centralOffset + centralSize !== endOffset) {
    throw archiveError('ZIP must contain exactly one file named main.py');
  }
  if (centralOffset + 46 > endOffset || archive.readUInt32LE(centralOffset) !== 0x02014b50) {
    throw archiveError('ZIP directory entry is invalid');
  }
  const flags = archive.readUInt16LE(centralOffset + 8);
  const method = archive.readUInt16LE(centralOffset + 10);
  const expectedCrc = archive.readUInt32LE(centralOffset + 16);
  const compressedSize = archive.readUInt32LE(centralOffset + 20);
  const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
  const filenameLength = archive.readUInt16LE(centralOffset + 28);
  const extraLength = archive.readUInt16LE(centralOffset + 30);
  const commentLength = archive.readUInt16LE(centralOffset + 32);
  const diskStart = archive.readUInt16LE(centralOffset + 34);
  const localOffset = archive.readUInt32LE(centralOffset + 42);
  const entryEnd = centralOffset + 46 + filenameLength + extraLength + commentLength;
  const filename = archive.subarray(centralOffset + 46, centralOffset + 46 + filenameLength).toString('utf8');
  if (entryEnd !== endOffset || filename !== 'main.py' || diskStart !== 0) {
    throw archiveError('ZIP must contain exactly one root-level main.py file');
  }
  const supportedFlags = 0x0008 | 0x0006 | 0x0800;
  if ((flags & ~supportedFlags) || (method === 0 && (flags & 0x0006)) || ![0, 8].includes(method)) {
    throw archiveError('Encrypted or unsupported ZIP compression is not accepted');
  }
  if (uncompressedSize < 1 || uncompressedSize > MAX_SOURCE_BYTES || compressedSize > MAX_ARCHIVE_BYTES) {
    throw archiveError('Python source in ZIP must be between 1 byte and 64 KiB');
  }
  if (localOffset + 30 > centralOffset || archive.readUInt32LE(localOffset) !== 0x04034b50) {
    throw archiveError('ZIP local file header is invalid');
  }
  const localFlags = archive.readUInt16LE(localOffset + 6);
  const localMethod = archive.readUInt16LE(localOffset + 8);
  const localNameLength = archive.readUInt16LE(localOffset + 26);
  const localExtraLength = archive.readUInt16LE(localOffset + 28);
  const localName = archive.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8');
  const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
  if (localName !== filename || localFlags !== flags || localMethod !== method || dataOffset + compressedSize > centralOffset) {
    throw archiveError('ZIP local and directory entries do not match');
  }
  const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
  let source;
  try {
    source = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_SOURCE_BYTES });
  } catch { throw archiveError('Python source in ZIP could not be safely decompressed'); }
  if (source.length !== uncompressedSize || crc32(source) !== expectedCrc) throw archiveError('ZIP source checksum is invalid');
  if (source.includes(0) || Buffer.from(source.toString('utf8'), 'utf8').compare(source) !== 0) {
    throw archiveError('Python source must be valid UTF-8 text');
  }
  return source;
}
