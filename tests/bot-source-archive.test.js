import assert from 'node:assert/strict';
import { extractMainPythonFromZip } from '../server/bots/sourceArchive.js';

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipOne(filename, source) {
  const name = Buffer.from(filename);
  const body = Buffer.from(source);
  const crc = crc32(body);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const directory = Buffer.concat([central, name]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(local.length + name.length + body.length, 16);
  return Buffer.concat([local, name, body, directory, end]);
}

const archive = zipOne('main.py', 'print("hello")\n');
assert.equal(extractMainPythonFromZip(archive).toString(), 'print("hello")\n');
assert.throws(() => extractMainPythonFromZip(zipOne('../main.py', 'print(1)')), /root-level main.py/);
const corrupt = Buffer.from(archive); corrupt[40] ^= 0xff;
assert.throws(() => extractMainPythonFromZip(corrupt), /checksum/);
assert.throws(() => extractMainPythonFromZip(Buffer.from('not a zip')), /between 22 bytes/);
console.log('✓ ZIP upload accepts only one safe root-level main.py and checks integrity');
