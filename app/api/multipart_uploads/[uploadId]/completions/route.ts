import { NextResponse } from 'next/server';
import { finishMultipartUpload } from '@/lib/s3';

export async function POST(request: Request) {

  const body = await request.json();

  const { fileKey, parts, uploadId } = body;

  const response = await finishMultipartUpload({
    fileKey,
    uploadId,
    parts
  });

  return NextResponse.json(
    {
      response
    },
    { status: 200 }
  );
}
