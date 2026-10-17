import { connection } from "next/server";
import { credentialOrigin } from "@/lib/certificates/credential";

export async function GET() {
  await connection();
  try {
    return Response.json(
      {
        id: `${credentialOrigin()}/api/credentials/issuer`,
        type: ["Profile"],
        name: "GitDojo",
        url: credentialOrigin(),
        image: { id: `${credentialOrigin()}/brand/gitdojo-mark.png`, type: "Image" },
        description:
          "GitDojo issues certificates for completion records in its Git learning platform.",
      },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch {
    return new Response("Issuer unavailable", { status: 503 });
  }
}
