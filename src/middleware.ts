import { NextResponse, type NextRequest } from "next/server";

import { proxy } from "@/proxy";

const ADMIN_HOSTNAME = "admin.sixstoriesstudio.com";

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";
  const isAdminDomain =
    hostname === ADMIN_HOSTNAME || hostname.startsWith(`${ADMIN_HOSTNAME}:`);

  // Redirect bare root on the admin subdomain to the /admin dashboard
  if (isAdminDomain && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  return proxy(request);
}

export const config = {
  matcher: ["/", "/admin/:path*", "/login"],
};
