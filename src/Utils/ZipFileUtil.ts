import { open } from "node:fs/promises";
import { createInflateRaw, inflateRawSync } from "node:zlib";
import { Readable } from "node:stream";
import type { ZipFileEntry } from "@/Protocols/ZipFileProtocol.ts";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_LENGTH = 22;
const MAX_COMMENT_BYTES = 65_535;
const CENTRAL_LENGTH = 46;
const LOCAL_LENGTH = 30;
const LOCAL_SIGNATURE_BYTES = 4;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const EOCD_COUNT_OFFSET = 10;
const EOCD_CENTRAL_SIZE_OFFSET = 12;
const EOCD_CENTRAL_OFFSET_OFFSET = 16;
const CENTRAL_METHOD_OFFSET = 10;
const CENTRAL_COMPRESSED_OFFSET = 20;
const CENTRAL_UNCOMPRESSED_OFFSET = 24;
const CENTRAL_NAME_LENGTH_OFFSET = 28;
const CENTRAL_EXTRA_LENGTH_OFFSET = 30;
const CENTRAL_COMMENT_LENGTH_OFFSET = 32;
const CENTRAL_LOCAL_OFFSET_OFFSET = 42;
const LOCAL_NAME_LENGTH_OFFSET = 26;
const LOCAL_EXTRA_LENGTH_OFFSET = 28;

export class ZipFileUtil {
  static async listEntries(filePath: string): Promise<ZipFileEntry[]> {
    // Why: the zip is read from its end (central directory) and each entry is read by position, so a large file is never loaded whole.
    const handle = await open(filePath, "r");
    try {
      const { size } = await handle.stat();
      const tailLength = Math.min(size, EOCD_LENGTH + MAX_COMMENT_BYTES);
      const tail = await ZipFileUtil.readAt(handle, size - tailLength, tailLength);
      const eocd = ZipFileUtil.findEndRecord(tail);
      const count = tail.readUInt16LE(eocd + EOCD_COUNT_OFFSET);
      const centralSize = tail.readUInt32LE(eocd + EOCD_CENTRAL_SIZE_OFFSET);
      const centralOffset = tail.readUInt32LE(eocd + EOCD_CENTRAL_OFFSET_OFFSET);
      const central = await ZipFileUtil.readAt(handle, centralOffset, centralSize);
      return ZipFileUtil.parseCentral(central, count);
    } finally {
      await handle.close();
    }
  }

  static isZip(bytes: Uint8Array): boolean {
    if (bytes.length < LOCAL_SIGNATURE_BYTES) {
      return false;
    }
    return Buffer.from(bytes.subarray(0, LOCAL_SIGNATURE_BYTES)).readUInt32LE(0) === LOCAL_SIGNATURE;
  }

  static listEntriesFromBuffer(archive: Uint8Array): ZipFileEntry[] {
    // Why: a zip that is already in memory is read from the same end record and central directory as a file, so both readers list the same entries.
    const data = ZipFileUtil.readBuffer(archive);
    const tailStart = Math.max(0, data.length - (EOCD_LENGTH + MAX_COMMENT_BYTES));
    const eocd = tailStart + ZipFileUtil.findEndRecord(data.subarray(tailStart));
    const count = data.readUInt16LE(eocd + EOCD_COUNT_OFFSET);
    const centralSize = data.readUInt32LE(eocd + EOCD_CENTRAL_SIZE_OFFSET);
    const centralOffset = data.readUInt32LE(eocd + EOCD_CENTRAL_OFFSET_OFFSET);
    return ZipFileUtil.parseCentral(data.subarray(centralOffset, centralOffset + centralSize), count);
  }

  static readEntryFromBuffer(archive: Uint8Array, entry: ZipFileEntry): Uint8Array {
    // Why: an entry of an archive in memory is inflated whole; the form zips of CVM hold one XML of a few megabytes.
    const data = ZipFileUtil.readBuffer(archive);
    if (data.readUInt32LE(entry.localHeaderOffset) !== LOCAL_SIGNATURE) {
      throw new Error(`the zip entry ${entry.name} has no local header; the file is damaged`);
    }
    const dataStart = entry.localHeaderOffset + LOCAL_LENGTH
      + data.readUInt16LE(entry.localHeaderOffset + LOCAL_NAME_LENGTH_OFFSET)
      + data.readUInt16LE(entry.localHeaderOffset + LOCAL_EXTRA_LENGTH_OFFSET);
    const compressed = data.subarray(dataStart, dataStart + entry.compressedBytes);
    if (entry.method === METHOD_STORED) {
      return Uint8Array.from(compressed);
    }
    if (entry.method !== METHOD_DEFLATE) {
      throw new Error(`the zip entry ${entry.name} uses method ${entry.method}, which is not read`);
    }
    return Uint8Array.from(inflateRawSync(compressed));
  }

  static async openEntry(filePath: string, entryName: string): Promise<Readable> {
    // Why: an entry is inflated while it streams, so a large entry is never held in memory whole.
    const entry = (await ZipFileUtil.listEntries(filePath)).find((candidate) => candidate.name === entryName);
    if (entry === undefined) {
      throw new Error(`the zip ${filePath} has no entry ${entryName}`);
    }
    const handle = await open(filePath, "r");
    const header = await ZipFileUtil.readAt(handle, entry.localHeaderOffset, LOCAL_LENGTH);
    if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) {
      await handle.close();
      throw new Error(`the zip entry ${entryName} has no local header; the file is damaged`);
    }
    const dataStart = entry.localHeaderOffset + LOCAL_LENGTH
      + header.readUInt16LE(LOCAL_NAME_LENGTH_OFFSET) + header.readUInt16LE(LOCAL_EXTRA_LENGTH_OFFSET);
    const end = dataStart + entry.compressedBytes - 1;
    const raw = handle.createReadStream({ start: dataStart, end });
    raw.once("close", () => {
      void handle.close();
    });
    if (entry.method === METHOD_STORED) {
      return raw;
    }
    if (entry.method !== METHOD_DEFLATE) {
      raw.destroy();
      throw new Error(`the zip entry ${entryName} uses method ${entry.method}, which is not read`);
    }
    const inflater = createInflateRaw();
    return raw.pipe(inflater);
  }

  private static findEndRecord(tail: Buffer): number {
    for (let index = tail.length - EOCD_LENGTH; index >= 0; index -= 1) {
      if (tail.readUInt32LE(index) === EOCD_SIGNATURE) {
        return index;
      }
    }
    throw new Error("the file is not a zip archive: no end of central directory");
  }

  private static readBuffer(bytes: Uint8Array): Buffer {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private static parseCentral(central: Buffer, count: number): ZipFileEntry[] {
    const entries: ZipFileEntry[] = [];
    let position = 0;
    for (let index = 0; index < count; index += 1) {
      if (central.readUInt32LE(position) !== CENTRAL_SIGNATURE) {
        throw new Error("the zip central directory is damaged");
      }
      const nameLength = central.readUInt16LE(position + CENTRAL_NAME_LENGTH_OFFSET);
      const name = central.toString("utf8", position + CENTRAL_LENGTH, position + CENTRAL_LENGTH + nameLength);
      entries.push({
        name,
        method: central.readUInt16LE(position + CENTRAL_METHOD_OFFSET),
        compressedBytes: central.readUInt32LE(position + CENTRAL_COMPRESSED_OFFSET),
        uncompressedBytes: central.readUInt32LE(position + CENTRAL_UNCOMPRESSED_OFFSET),
        localHeaderOffset: central.readUInt32LE(position + CENTRAL_LOCAL_OFFSET_OFFSET),
      });
      position += CENTRAL_LENGTH + nameLength
        + central.readUInt16LE(position + CENTRAL_EXTRA_LENGTH_OFFSET)
        + central.readUInt16LE(position + CENTRAL_COMMENT_LENGTH_OFFSET);
    }
    return entries;
  }

  private static async readAt(
    handle: Awaited<ReturnType<typeof open>>,
    position: number,
    length: number,
  ): Promise<Buffer> {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (bytesRead !== length) {
      throw new Error("the zip file ended before the expected bytes");
    }
    return buffer;
  }
}
