export type ExtractedSegment = {
  section: string | null;
  page: number | null;
  text: string;
  item?: string | null;
};

export type ExtractedDocument = {
  format: "pdf" | "html" | "form";
  pagesWithoutText: number;
  skippedAttachments?: number;
  segments: ExtractedSegment[];
};

export type ChunkRow = {
  section: string | null;
  item: string | null;
  page: number | null;
  seq: number;
  text: string;
};

export type HtmlReadState = {
  section: string | null;
  buffer: string[];
};

export type FormItem = {
  section: string;
  label: string;
  content: string;
  item: string | null;
};
