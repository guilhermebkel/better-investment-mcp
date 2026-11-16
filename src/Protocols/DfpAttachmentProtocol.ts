export type DfpAttachment = {
  group: string;
  content: string;
};

export type PdfPage = {
  page: number | null;
  text: string;
};

export type DfpAttachmentResult = {
  segments: {
    section: string;
    page: number | null;
    text: string;
  }[];
  skipped: number;
};
