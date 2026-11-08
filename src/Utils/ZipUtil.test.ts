import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ZipUtil } from "@/Utils/ZipUtil.ts";

const buildZip = (name: string, content: Uint8Array, method: number): Uint8Array => {
  const nameBytes = new TextEncoder().encode(name);
  const deflated = new Uint8Array(deflateRawSync(content));
  const packed = method === 8 ? deflated : content;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBytes.length + packed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  const packedBuffer = Buffer.from(packed);
  const parts = [local, nameBytes, packedBuffer, central, nameBytes, end];
  return new Uint8Array(Buffer.concat(parts));
};

const readText = (zip: Uint8Array, name: string): string => {
  const entry = ZipUtil.readEntry(zip, name);
  return new TextDecoder().decode(entry);
};

describe("ZipUtil.readEntry()", () => {
  const content = new TextEncoder().encode("a;b\n1;2\n");
  const deflatedZip = buildZip("data.csv", content, 8);
  const storedZip = buildZip("data.csv", content, 0);
  const notAZip = new TextEncoder().encode("not a zip at all, just text");

  it("inflates a deflated entry", () => {
    expect(readText(deflatedZip, "data.csv")).toBe("a;b\n1;2\n");
  });

  it("reads a stored entry", () => {
    expect(readText(storedZip, "data.csv")).toBe("a;b\n1;2\n");
  });

  it("refuses a name the archive does not hold", () => {
    expect(() => ZipUtil.readEntry(deflatedZip, "other.csv")).toThrow("the zip has no entry named other.csv");
  });

  it("refuses a file that is not a zip", () => {
    expect(() => ZipUtil.readEntry(notAZip, "x.csv")).toThrow("not a zip archive");
  });
});
