/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const REGION = process.env.NEXT_AWS_S3_REGION;
const UPLOAD_BUCKET = process.env.NEXT_AWS_S3_BUCKET_NAME;

// NOTE: these are named differently than the normal AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
// because Vercel does not allow you to set those environment variables for a deployment
const client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: `${process.env.NEXT_AWS_S3_ACCESS_KEY_ID}`,
    secretAccessKey: `${process.env.NEXT_AWS_S3_SECRET_ACCESS_KEY}`,
  },
});

const generateFileName = (bytes = 32) =>
  crypto.randomBytes(bytes).toString("hex");

export const createMultipartUpload = async ({
  filename,
}: {
  filename: string;
}) => {
  const { Key, UploadId } = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: UPLOAD_BUCKET,
      Key: `datasets/${generateFileName()}/${filename}`,
      ACL: "private",
    })
  );

  return {
    uploadId: UploadId,
    fileKey: Key,
  };
};

export const createMultipartUploadPart = async ({
  fileKey,
  uploadId,
  partNumber,
}: {
  fileKey: string;
  uploadId: string;
  partNumber: number;
}) => {
  const command = new UploadPartCommand({
    Bucket: UPLOAD_BUCKET,
    Key: fileKey,
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  const signedUrl = await getSignedUrl(
    client as any, // avoiding typescript lint errors
    command as any, // avoiding typescript lint errors
    {
      expiresIn: 3600,
    }
  );

  return {
    signedUrl,
  };
};

export const finishMultipartUpload = async ({
  fileKey,
  uploadId,
  parts,
}: {
  fileKey: string;
  uploadId: string;
  parts: { ETag: string; PartNumber: number }[];
}) => {
  const response = await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: UPLOAD_BUCKET,
      Key: fileKey,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.sort((a, b) => {
          if (a.PartNumber < b.PartNumber) {
            return -1;
          }

          if (a.PartNumber > b.PartNumber) {
            return 1;
          }

          return 0;
        }),
      },
    })
  );

  return response;
};
