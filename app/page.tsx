"use client";

import { useState } from "react";
import { Uploader } from "@/lib/Uploader";

export default function Home() {
  const [upload, setUpload] = useState<Uploader | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileLocation, setFileLocation] = useState<string | null>(null);

  const onFileChanged = (e: React.FormEvent<HTMLInputElement>) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    const file = files[0];
    const uploader = new Uploader({ file })
      .onProgress(({ percentage }) => {
        setUploadProgress(percentage);
      })
      .onComplete((response) => {
        const uploadResponse = response as { response: { Location: string } };
        setFileLocation(uploadResponse.response.Location);
        setUploadProgress(100); // Ensure progress bar reaches 100% on complete
      })
      .onError((error) => {
        console.error("upload error", error);
      });

    setUpload(uploader);
    uploader.start();
  };


  return (
    <div className="mx-auto max-w-7xl sm:p-6 lg:p-8">
      <div className="flex text-sm text-gray-600">
        <label
          htmlFor="file-upload"
          className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <div className="text-lg">Upload a file</div>
          <input
            id="file-upload"
            name="files"
            type="file"
            className="sr-only"
            onChange={onFileChanged}
            size={1000}
            accept=".csv, .xlsx, .xls, .sav"
          />
        </label>
      </div>

      <div className="mt-2">
        {upload && (
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full animate-pulse"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
        {upload && (
          <p className="text-sm text-gray-500 mt-1">
            Uploading... {uploadProgress}%
          </p>
        )}
      </div>

      <p className="py-2 text-sm text-gray-500">Any file up to 1TB</p>
      { fileLocation && (
        <button
          className="mt-2 inline-flex items-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          onClick={() => window.open(fileLocation, '_blank')}
        >
          Download here the file
        </button>
      ) }
    </div>
  );
}
