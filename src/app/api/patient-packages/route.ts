import { NextResponse, type NextRequest } from "next/server";
import { getProfile } from "@/lib/auth";
import { getActivePackagesForPatient } from "@/lib/sales";

/**
 * Active (session-remaining) packages for a patient, used by the
 * checkout to offer redemptions. RLS scopes results to the caller's
 * clinic, and getProfile() guards that the caller is signed in.
 */
export async function GET(request: NextRequest) {
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ packages: [] }, { status: 401 });
  }

  const patientId = request.nextUrl.searchParams.get("patient");
  if (!patientId) {
    return NextResponse.json({ packages: [] });
  }

  const packages = await getActivePackagesForPatient(patientId);
  return NextResponse.json({ packages });
}
