import { deflateRawSync } from "node:zlib";

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const METHOD_DEFLATE = 8;
const LOCAL_HEADER_LENGTH = 30;
const CENTRAL_HEADER_LENGTH = 46;
const EOCD_LENGTH = 22;
const LOCAL_METHOD_OFFSET = 8;
const LOCAL_PACKED_OFFSET = 18;
const LOCAL_UNPACKED_OFFSET = 22;
const LOCAL_NAME_OFFSET = 26;
const CENTRAL_METHOD_OFFSET = 10;
const CENTRAL_PACKED_OFFSET = 20;
const CENTRAL_UNPACKED_OFFSET = 24;
const CENTRAL_NAME_OFFSET = 28;
const CENTRAL_LOCAL_OFFSET = 42;
const EOCD_COUNT_OFFSET = 8;
const EOCD_CENTRAL_SIZE_OFFSET = 12;
const EOCD_CENTRAL_START_OFFSET = 16;

export class ZipFixture {
  static buildZipOf(nameToText: Readonly<Record<string, string>>): Uint8Array {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;
    // Why: a small zip built in the test, so no test needs a yearly file of the vendor; the entries are stored deflated.
    const entries = Object.entries(nameToText);
    for (const [name, text] of entries) {
      const nameBytes = Buffer.from(name);
      const raw = Buffer.from(text, "latin1");
      const packed = deflateRawSync(raw);
      const local = Buffer.alloc(LOCAL_HEADER_LENGTH);
      local.writeUInt32LE(LOCAL_SIGNATURE, 0);
      local.writeUInt16LE(METHOD_DEFLATE, LOCAL_METHOD_OFFSET);
      local.writeUInt32LE(packed.length, LOCAL_PACKED_OFFSET);
      local.writeUInt32LE(raw.length, LOCAL_UNPACKED_OFFSET);
      local.writeUInt16LE(nameBytes.length, LOCAL_NAME_OFFSET);
      const central = Buffer.alloc(CENTRAL_HEADER_LENGTH);
      central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
      central.writeUInt16LE(METHOD_DEFLATE, CENTRAL_METHOD_OFFSET);
      central.writeUInt32LE(packed.length, CENTRAL_PACKED_OFFSET);
      central.writeUInt32LE(raw.length, CENTRAL_UNPACKED_OFFSET);
      central.writeUInt16LE(nameBytes.length, CENTRAL_NAME_OFFSET);
      central.writeUInt32LE(offset, CENTRAL_LOCAL_OFFSET);
      locals.push(local, nameBytes, packed);
      centrals.push(central, nameBytes);
      offset += local.length + nameBytes.length + packed.length;
    }
    const centralBytes = Buffer.concat(centrals);
    const end = Buffer.alloc(EOCD_LENGTH);
    end.writeUInt32LE(EOCD_SIGNATURE, 0);
    end.writeUInt16LE(entries.length, EOCD_COUNT_OFFSET);
    end.writeUInt16LE(entries.length, EOCD_COUNT_OFFSET + 2);
    end.writeUInt32LE(centralBytes.length, EOCD_CENTRAL_SIZE_OFFSET);
    end.writeUInt32LE(offset, EOCD_CENTRAL_START_OFFSET);
    return new Uint8Array(Buffer.concat([...locals, centralBytes, end]));
  }
}
