import { NextResponse } from 'next/server';
import { createMultipartUpload } from '@/lib/s3';

export async function POST(request: Request) {

  const body = await request.json();
  const { filename } = body;

  const { uploadId, fileKey } = await createMultipartUpload({ filename });

  return NextResponse.json(
    {
      uploadId,
      fileKey
    },
    { status: 201 }
  );
}
