import { NextResponse, type NextRequest } from "next/server";
import { openDocument } from "@/server/documents";
import { api } from "@/server/http";
import { requireUser } from "@/server/session";

export function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return api(request, async () => {
    const user = await requireUser(request);
    const { id } = await params;
    const { bytes, fileName } = await openDocument(user, id);
    const fallback = fileName.replace(/[^\w .()-]/g, "_");
    const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16)}`);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
