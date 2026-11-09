export class CvmFailureError extends Error {
  constructor(details: string) {
    super(`CVM: ${details}`);
    this.name = "CvmFailureError";
  }
}
