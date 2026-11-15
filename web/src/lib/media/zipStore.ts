import { createReadStream, createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { once } from "events";
import { randomBytes } from "crypto";
import { pipeline } from "stream/promises";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32Update(crc: number, chunk: Uint8Array): number {
  let c = crc;
  for (let i = 0; i < chunk.length; i += 1) {
    c = CRC_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8);
  }
  return c >>> 0;
}

function dosDateTime(date: Date): { time: number; day: number } {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export interface ZipEntrySource {
  name: string;
  open: () => Promise<ReadableStream<Uint8Array> | null>;
}

function u16(buf: Buffer, offset: number, value: number) {
  buf.writeUInt16LE(value & 0xffff, offset);
}

function u32(buf: Buffer, offset: number, value: number) {
  buf.writeUInt32LE(value >>> 0, offset);
}

async function spoolStream(
  stream: ReadableStream<Uint8Array>,
  spoolPath: string
): Promise<{ size: number; crc: number }> {
  const spool = createWriteStream(spoolPath);
  const reader = stream.getReader();
  let crc = 0xffffffff;
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      const copy = Buffer.from(value);
      crc = crc32Update(crc, copy);
      size += copy.length;
      if (size > 0xffffffff) throw new Error("ไฟล์ใหญ่เกินกว่าที่ ZIP รองรับ");
      if (!spool.write(copy)) await once(spool, "drain");
    }
  } finally {
    reader.releaseLock();
    await new Promise<void>((resolve, reject) => {
      spool.once("error", reject);
      spool.end(() => resolve());
    });
  }
  return { size, crc: (crc ^ 0xffffffff) >>> 0 };
}

/**
 * Writes a stored ZIP that macOS Archive Utility can expand.
 * Sizes and CRC live in the local header, so the archive is complete before it is sent.
 */
export async function writeStoredZip(entries: ZipEntrySource[], outPath: string): Promise<void> {
  const out = createWriteStream(outPath);
  const encoder = new TextEncoder();
  const now = dosDateTime(new Date());
  const central: Buffer[] = [];
  let offset = 0;
  const failures: string[] = [];

  const write = async (chunk: Uint8Array) => {
    const copy = Buffer.from(chunk);
    if (!out.write(copy)) await once(out, "drain");
    offset += copy.length;
  };

  const appendEntry = async (name: string, bytes: Uint8Array, crc: number, size: number) => {
    const nameBytes = encoder.encode(name);
    const local = Buffer.alloc(30);
    u32(local, 0, 0x04034b50);
    u16(local, 4, 20);
    u16(local, 6, 0x0800);
    u16(local, 8, 0);
    u16(local, 10, now.time);
    u16(local, 12, now.day);
    u32(local, 14, crc);
    u32(local, 18, size);
    u32(local, 22, size);
    u16(local, 26, nameBytes.length);
    const localOffset = offset;
    await write(local);
    await write(nameBytes);
    if (size > 0) await write(bytes);
    const header = Buffer.alloc(46);
    u32(header, 0, 0x02014b50);
    u16(header, 4, 20);
    u16(header, 6, 20);
    u16(header, 8, 0x0800);
    u16(header, 10, 0);
    u16(header, 12, now.time);
    u16(header, 14, now.day);
    u32(header, 16, crc);
    u32(header, 20, size);
    u32(header, 24, size);
    u16(header, 28, nameBytes.length);
    u32(header, 42, localOffset);
    central.push(Buffer.concat([header, Buffer.from(nameBytes)]));
  };

  try {
    for (const entry of entries) {
      const spoolPath = `${outPath}.${randomBytes(4).toString("hex")}.part`;
      let stream: ReadableStream<Uint8Array> | null = null;
      try {
        stream = await entry.open();
      } catch {
        stream = null;
      }
      if (!stream) {
        failures.push(entry.name);
        continue;
      }
      try {
        const { size, crc } = await spoolStream(stream, spoolPath);
        const nameBytes = encoder.encode(entry.name);
        const local = Buffer.alloc(30);
        u32(local, 0, 0x04034b50);
        u16(local, 4, 20);
        u16(local, 6, 0x0800);
        u16(local, 8, 0);
        u16(local, 10, now.time);
        u16(local, 12, now.day);
        u32(local, 14, crc);
        u32(local, 18, size);
        u32(local, 22, size);
        u16(local, 26, nameBytes.length);
        const localOffset = offset;
        await write(local);
        await write(nameBytes);
        if (size > 0) {
          await pipeline(createReadStream(spoolPath), out, { end: false });
          offset += size;
        }
        const header = Buffer.alloc(46);
        u32(header, 0, 0x02014b50);
        u16(header, 4, 20);
        u16(header, 6, 20);
        u16(header, 8, 0x0800);
        u16(header, 10, 0);
        u16(header, 12, now.time);
        u16(header, 14, now.day);
        u32(header, 16, crc);
        u32(header, 20, size);
        u32(header, 24, size);
        u16(header, 28, nameBytes.length);
        u32(header, 42, localOffset);
        central.push(Buffer.concat([header, Buffer.from(nameBytes)]));
      } catch {
        failures.push(entry.name);
      } finally {
        await unlink(spoolPath).catch(() => undefined);
      }
    }

    if (failures.length > 0) {
      const note = encoder.encode(`ดาวน์โหลดไฟล์เหล่านี้ไม่สำเร็จ:\n${failures.join("\n")}\n`);
      const crc = (crc32Update(0xffffffff, note) ^ 0xffffffff) >>> 0;
      await appendEntry("failed.txt", note, crc, note.length);
    }

    const centralStart = offset;
    let centralSize = 0;
    for (const part of central) {
      await write(part);
      centralSize += part.length;
    }
    const end = Buffer.alloc(22);
    u32(end, 0, 0x06054b50);
    u16(end, 8, central.length);
    u16(end, 10, central.length);
    u32(end, 12, centralSize);
    u32(end, 16, centralStart);
    await write(end);
    await new Promise<void>((resolve, reject) => {
      out.once("error", reject);
      out.end(() => resolve());
    });
  } catch (error) {
    out.destroy();
    throw error;
  }
}
