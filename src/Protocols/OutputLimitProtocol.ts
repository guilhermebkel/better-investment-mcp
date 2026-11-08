export type OutputLimits = {
  maxRows: number;
  maxChars: number;
};

export type OutputLimitResult = {
  text: string;
  returnedRows: number;
  remainingRows: number;
  remainingChars: number;
  isTruncated: boolean;
};
