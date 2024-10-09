import axios from "axios";

const API_BASE_URL = "/api/";

const api = axios.create({
  baseURL: API_BASE_URL,
});

interface Part {
  ETag: string;
  PartNumber: number;
}

interface IOptions {
  chunkSize?: number;
  threadsQuantity?: number;
  file: File;
}

interface Progress {
  sent: number;
  total: number;
  percentage: number;
}

export class Uploader {
  chunkSize: number;
  threadsQuantity: number;
  file: File;
  aborted: boolean;
  uploadedSize: number;
  progressCache: Record<number, number>;
  activeConnections: Record<number, XMLHttpRequest>;
  parts: Part[];
  uploadedParts: Part[];
  uploadId: string | null;
  fileKey: string | null;
  onProgressFn: (progress: Progress) => void;
  onErrorFn: (err: unknown) => void;
  onCompleteFn: (response: unknown) => void;

  constructor(options: IOptions) {
    this.chunkSize = options.chunkSize || 1024 * 1024 * 5;
    this.threadsQuantity = Math.min(options.threadsQuantity || 5, 15);
    this.file = options.file;
    this.aborted = false;
    this.uploadedSize = 0;
    this.progressCache = {};
    this.activeConnections = {};
    this.parts = [];
    this.uploadedParts = [];
    this.uploadId = null;
    this.fileKey = null;
    this.onProgressFn = (progress) => console.log("progress", progress);
    this.onErrorFn = (err) => console.log("err", err);
    this.onCompleteFn = (response) => console.log("response", response);
  }

  start() {
    this.initialize();
  }

  async initialize() {
    try {
      const { data: { uploadId, fileKey } } = await api.request({
        url: "/multipart_uploads",
        method: "POST",
        data: {
          filename: this.file.name,
        },
      });

      this.uploadId = uploadId;
      this.fileKey = fileKey;

      const numberOfParts = Math.ceil(this.file.size / this.chunkSize);

      this.parts.push(
        ...[...Array(numberOfParts).keys()].map((_, index) => ({
          PartNumber: index + 1,
          ETag: "",
        }))
      );

      this.sendNext();
    } catch (error) {
      await this.complete(error);
    }
  }

  sendNext() {
    const activeConnections = Object.keys(this.activeConnections).length;

    if (activeConnections >= this.threadsQuantity) {
      return;
    }

    if (!this.parts.length) {
      if (!activeConnections) {
        this.complete();
      }
      return;
    }

    const part = this.parts.pop();

    if (this.file && part) {
      const sentSize = (part.PartNumber - 1) * this.chunkSize;
      const chunk = this.file.slice(sentSize, sentSize + this.chunkSize);

      const sendChunkStarted = () => {
        this.sendNext();
      };

      this.sendChunk(chunk, part, sendChunkStarted)
        .then(() => {
          this.sendNext();
        })
        .catch((error) => {
          this.parts.push(part);
          this.complete(error);
        });
    }
  }

  async complete(error: unknown | undefined = null) {
    if (error && !this.aborted) {
      this.onErrorFn(error);
      return;
    }

    if (error) {
      this.onErrorFn(error);
      return;
    }

    try {
      const response = await this.sendCompleteRequest();
      this.onCompleteFn(response);
    } catch (error) {
      this.onErrorFn(error);
    }
  }

  async sendCompleteRequest() {
    if (this.uploadId && this.fileKey) {
      const response = await api.request({
        url: `/multipart_uploads/${this.uploadId}/completions`,
        method: "POST",
        data: {
          fileKey: this.fileKey,
          uploadId: this.uploadId,
          parts: this.uploadedParts,
        },
      });

      return response.data;
    }
  }

  sendChunk(chunk: Blob, part: Part, sendChunkStarted: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.upload(chunk, part, sendChunkStarted)
        .then((status) => {
          if (status !== 200) {
            reject(new Error("Failed chunk upload"));
            return;
          }

          resolve();
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  handleProgress(part: number, event: ProgressEvent) {
    if (this.file) {
      if (event.type === "progress" || event.type === "error" || event.type === "abort") {
        this.progressCache[part] = event.loaded;
      }

      if (event.type === "loadend") {
        this.uploadedSize += this.progressCache[part] || 0;
        delete this.progressCache[part];
      }

      const inProgress = Object.values(this.progressCache).reduce((memo, loaded) => memo + loaded, 0);

      const sent = Math.min(this.uploadedSize + inProgress, this.file.size);
      const total = this.file.size;
      const percentage = Math.round((sent / total) * 100);

      this.onProgressFn({
        sent,
        total,
        percentage,
      });
    }
  }

  upload(file: Blob, part: Part, sendChunkStarted: () => void): Promise<number> {
    return new Promise(async (resolve, reject) => {
      if (this.uploadId && this.fileKey) {
        try {
          const { data: { signedUrl } } = await api.request({
            url: `/multipart_uploads/${this.uploadId}/part_url`,
            method: "POST",
            data: {
              fileKey: this.fileKey,
              uploadId: this.uploadId,
              partNumber: part.PartNumber,
            },
          });

          const xhr = (this.activeConnections[part.PartNumber - 1] = new XMLHttpRequest());

          sendChunkStarted();

          const progressListener = this.handleProgress.bind(this, part.PartNumber - 1);

          xhr.upload.addEventListener("progress", progressListener);
          xhr.addEventListener("error", progressListener);
          xhr.addEventListener("abort", progressListener);
          xhr.addEventListener("loadend", progressListener);

          xhr.open("PUT", signedUrl);

          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status === 200) {
                const ETag = xhr.getResponseHeader("etag");

                if (ETag) {
                  const uploadedPart = {
                    PartNumber: part.PartNumber,
                    ETag: ETag.replaceAll('"', ""),
                  };

                  this.uploadedParts.push(uploadedPart);

                  resolve(xhr.status);
                  delete this.activeConnections[part.PartNumber - 1];
                }
              } else {
                reject(new Error(`Failed to upload part ${part.PartNumber}`));
                delete this.activeConnections[part.PartNumber - 1];
              }
            }
          };

          xhr.onerror = (error) => {
            reject(error);
            delete this.activeConnections[part.PartNumber - 1];
          };

          xhr.onabort = () => {
            reject(new Error("Upload canceled by user"));
            delete this.activeConnections[part.PartNumber - 1];
          };

          xhr.send(file);
        } catch (error) {
          reject(error);
        }
      }
    });
  }

  onProgress(onProgress: (progress: Progress) => void) {
    this.onProgressFn = onProgress;
    return this;
  }

  onComplete(onComplete: (response: unknown) => void) {
    this.onCompleteFn = onComplete;
    return this;
  }

  onError(onError: (err: unknown) => void) {
    this.onErrorFn = onError;
    return this;
  }

  abort() {
    Object.keys(this.activeConnections)
      .map(Number)
      .forEach((id) => {
        this.activeConnections[id].abort();
      });

    this.aborted = true;
  }
}