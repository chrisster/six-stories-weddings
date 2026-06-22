import { PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

// Temporary diagnostic endpoint — remove after confirming R2 works.
export async function GET() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? "sixstories";

  const configured = Boolean(accountId && accessKeyId && secretAccessKey);

  if (!configured) {
    return NextResponse.json({
      ok: false,
      provider: "supabase-fallback",
      reason: "R2 env vars not set — storage falling back to Supabase Storage.",
    });
  }

  try {
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });

    const testKey = "_r2-check/ping.txt";

    // Write a tiny object then immediately delete it.
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: "ok",
        ContentType: "text/plain",
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));

    return NextResponse.json({
      ok: true,
      provider: "cloudflare-r2",
      bucket,
      message: "R2 connection successful. Write + delete test passed.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        provider: "cloudflare-r2",
        bucket,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
