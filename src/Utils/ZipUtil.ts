import { inflateRawSync } from "node:zlib";
import type { ZipEntry } from "@/Protocols/ZipProtocol.ts";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_LENGTH = 22;
const EOCD_MAX_COMMENT = 65_535;
const CENTRAL_FIXED_LENGTH = 46;
const LOCAL_FIXED_LENGTH = 30;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const BYTES_PER_MIB = 1_048_576;
const MAX_UNPACKED_MIB = 200;
const MAX_UNPACKED_BYTES = MAX_UNPACKED_MIB * BYTES_PER_MIB;
const EOCD_ENTRY_COUNT_OFFSET = 10;
const EOCD_CENTRAL_OFFSET = 16;
const CENTRAL_METHOD_OFFSET = 10;
const CENTRAL_COMPRESSED_OFFSET = 20;
const CENTRAL_UNPACKED_OFFSET = 24;
const CENTRAL_NAME_LENGTH_OFFSET = 28;
const CENTRAL_EXTRA_LENGTH_OFFSET = 30;
const CENTRAL_COMMENT_LENGTH_OFFSET = 32;
const CENTRAL_LOCAL_OFFSET = 42;
const LOCAL_NAME_LENGTH_OFFSET = 26;
const LOCAL_EXTRA_LENGTH_OFFSET = 28;

export class ZipUtil {
  static readEntry(zip: Uint8Array, entryName: string): Uint8Array {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    const endOfCentral = ZipUtil.findEndOfCentral(view);
    const entryCount = view.getUint16(endOfCentral + EOCD_ENTRY_COUNT_OFFSET, true);
    let position = view.getUint32(endOfCentral + EOCD_CENTRAL_OFFSET, true);
    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(position, true) !== CENTRAL_SIGNATURE) {
        throw new Error("the zip central directory is damaged");
      }
      const nameLength = view.getUint16(position + CENTRAL_NAME_LENGTH_OFFSET, true);
      const extraLength = view.getUint16(position + CENTRAL_EXTRA_LENGTH_OFFSET, true);
      const commentLength = view.getUint16(position + CENTRAL_COMMENT_LENGTH_OFFSET, true);
      const nameStart = position + CENTRAL_FIXED_LENGTH;
      const name = new TextDecoder().decode(zip.subarray(nameStart, nameStart + nameLength));
      if (name === entryName) {
        const entry: ZipEntry = {
          method: view.getUint16(position + CENTRAL_METHOD_OFFSET, true),
          compressedSize: view.getUint32(position + CENTRAL_COMPRESSED_OFFSET, true),
          unpackedSize: view.getUint32(position + CENTRAL_UNPACKED_OFFSET, true),
          localOffset: view.getUint32(position + CENTRAL_LOCAL_OFFSET, true),
        };
        return ZipUtil.readData(zip, view, entry);
      }
      position += CENTRAL_FIXED_LENGTH + nameLength + extraLength + commentLength;
    }
    throw new Error(`the zip has no entry named ${entryName}`);
  }

  private static findEndOfCentral(view: DataView): number {
    const lowest = Math.max(0, view.byteLength - EOCD_MIN_LENGTH - EOCD_MAX_COMMENT);
    for (let position = view.byteLength - EOCD_MIN_LENGTH; position >= lowest; position -= 1) {
      if (view.getUint32(position, true) === EOCD_SIGNATURE) {
        return position;
      }
    }
    throw new Error("the file is not a zip archive");
  }

  private static readData(zip: Uint8Array, view: DataView, entry: ZipEntry): Uint8Array {
    if (view.getUint32(entry.localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error("the zip local header is damaged");
    }
    // Why: the unpacked size is checked before inflating, so a small file that expands to a huge one is refused.
    if (entry.unpackedSize > MAX_UNPACKED_BYTES) {
      throw new Error(`the zip entry is larger than ${MAX_UNPACKED_BYTES} bytes`);
    }
    const nameLength = view.getUint16(entry.localOffset + LOCAL_NAME_LENGTH_OFFSET, true);
    const extraLength = view.getUint16(entry.localOffset + LOCAL_EXTRA_LENGTH_OFFSET, true);
    const start = entry.localOffset + LOCAL_FIXED_LENGTH + nameLength + extraLength;
    const packed = zip.subarray(start, start + entry.compressedSize);
    if (entry.method === METHOD_STORED) {
      return packed;
    }
    if (entry.method === METHOD_DEFLATE) {
      return new Uint8Array(inflateRawSync(packed, { maxOutputLength: MAX_UNPACKED_BYTES }));
    }
    throw new Error(`the zip entry uses an unsupported method ${entry.method}`);
  }
}
