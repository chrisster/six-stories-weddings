import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { hasSupabaseEnv } from "@/lib/env";

// Only the studio routes need a verified (and refreshed) Supabase session
// before rendering; the client portal, the signing pages and the route
// handlers manage their own access. A tight matcher means guests never pay
// for an auth round trip, and RSC prefetches outside /admin skip the proxy.
export const config = {
  matcher: ["/", "/admin/:path*", "/g/:path*"],
};

function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));
}

export async function proxy(request: NextRequest) {
  if (!hasSupabaseEnv) {
    return NextResponse.next();
  }

  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");

  // No session cookie at all: nothing to verify or refresh. Gallery guests
  // and portal clients take this path, and an anonymous /admin visit goes
  // straight to the login page without calling Supabase.
  if (!hasSupabaseSessionCookie(request)) {
    if (isAdminRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isAdminRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (request.nextUrl.pathname === "/" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  return response;
}
