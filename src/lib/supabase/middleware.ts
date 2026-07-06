import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie and redirects unauthenticated
 * users to the login page. Receives the response produced by the
 * next-intl middleware so both sets of cookies/headers survive.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Supabase not configured yet (fresh checkout) — skip auth handling.
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not run code between createServerClient and getUser() —
  // it can cause random logouts (see Supabase SSR docs).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // Strip the locale prefix (/ar/..., /en/...) for route checks.
  const pathWithoutLocale = pathname.replace(/^\/(ar|en)(?=\/|$)/, "") || "/";
  const isPublicRoute = pathWithoutLocale.startsWith("/login");

  if (!user && !isPublicRoute) {
    const locale = pathname.match(/^\/(ar|en)(?=\/|$)/)?.[1] ?? "ar";
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${locale}/login`;
    const redirect = NextResponse.redirect(loginUrl);
    // Keep any refreshed auth cookies on the redirect response.
    response.cookies.getAll().forEach(({ name, value }) => {
      redirect.cookies.set(name, value);
    });
    return redirect;
  }

  return response;
}
