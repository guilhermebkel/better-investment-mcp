export type ZipFileEntry = {
  name: string;
  method: number;
  compressedBytes: number;
  uncompressedBytes: number;
  localHeaderOffset: number;
};
