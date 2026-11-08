export type ZipEntry = {
  method: number;
  compressedSize: number;
  unpackedSize: number;
  localOffset: number;
};

export type LocatedEntry = {
  method: number;
  packed: Uint8Array;
};
