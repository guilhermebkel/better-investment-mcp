import { writeFileSync } from "node:fs";
import { HttpFailureError } from "@/Errors/HttpFailureError.ts";
import type { HttpPort } from "@/Protocols/HttpProtocol.ts";

const NOT_FOUND_STATUS = 404;

export class FakeHttp {
  static buildServing(
    urlToBytes: Readonly<Record<string, Uint8Array>>,
  ): {
    http: HttpPort;
    urls: string[];
  } {
    const urls: string[] = [];
    const http: HttpPort = {
      getText: () => Promise.reject(new Error("not used")),
      postForm: () => Promise.reject(new Error("not used")),
      getCookies: () => Promise.reject(new Error("not used")),
      getBytes: (url: string) => {
        urls.push(url);
        const file = urlToBytes[url];
        if (file === undefined) {
          // Why: the double answers 404 for any URL it does not serve, which is how the CVM adapters skip a year without a file.
          return Promise.reject(new HttpFailureError("the vendor answered with status 404", NOT_FOUND_STATUS));
        }
        return Promise.resolve(file);
      },
      downloadToFile: (url: string, filePath: string) => {
        urls.push(url);
        const file = urlToBytes[url];
        if (file === undefined) {
          return Promise.reject(new HttpFailureError("the vendor answered with status 404", NOT_FOUND_STATUS));
        }
        // Why: the double writes the recorded bytes to the path the adapter asks for, as the real download does.
        writeFileSync(filePath, file);
        return Promise.resolve(file.byteLength);
      },
    };
    return { http, urls };
  }
}
