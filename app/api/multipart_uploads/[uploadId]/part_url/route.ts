import { NextResponse } from 'next/server';
import { createMultipartUploadPart } from '@/lib/s3';

export async function POST(request: Request) {
  const body = await request.json();

  const { fileKey, partNumber, uploadId } = body;

  const { signedUrl } = await createMultipartUploadPart({
    fileKey,
    uploadId,
    partNumber
  });

  return NextResponse.json(
    {
      signedUrl
    },
    { status: 200 }
  );
}
