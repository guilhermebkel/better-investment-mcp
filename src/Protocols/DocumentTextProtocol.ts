export type ExtractedSegment = {
  section: string | null;
  page: number | null;
  text: string;
};

export type ExtractedDocument = {
  format: "pdf" | "html";
  pagesWithoutText: number;
  segments: ExtractedSegment[];
};

export type ChunkRow = {
  section: string | null;
  page: number | null;
  seq: number;
  text: string;
};

export type HtmlReadState = {
  section: string | null;
  buffer: string[];
};
