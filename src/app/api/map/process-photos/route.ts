import { NextResponse } from "next/server";

import { processMapperPhotosCore } from "@/lib/vision/process-mapper-photos";

/** Multi-image vision can exceed default serverless timeout. */
export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Upload too large or invalid. Use 1–4 compressed photos (phone shots are resized automatically).",
      },
      { status: 413 }
    );
  }

  const result = await processMapperPhotosCore(formData);
  return NextResponse.json(result, {
    status: result.ok ? 200 : 400,
  });
}
