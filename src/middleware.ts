import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { roleSatisfies, type Role } from "@/lib/constants";

// First line of defence. Every page and API route ALSO checks roles server-side (src/lib/rbac.ts).
const RULES: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/api/admin", roles: ["ADMIN"] },
  { prefix: "/desk", roles: ["ADMIN", "OFFICIAL"] },
  { prefix: "/api/desk", roles: ["ADMIN", "OFFICIAL"] },
  { prefix: "/scan", roles: ["ADMIN", "OFFICIAL"] },
  { prefix: "/api/scan", roles: ["ADMIN", "OFFICIAL"] },
  { prefix: "/score", roles: ["ADMIN", "OFFICIAL"] },
  { prefix: "/api/score", roles: ["ADMIN", "OFFICIAL"] },
  { prefix: "/medical", roles: ["MEDICAL"] },
  { prefix: "/api/medical", roles: ["MEDICAL"] },
  { prefix: "/coach", roles: ["COACH"] },
  { prefix: "/api/coach", roles: ["COACH"] },
];

export default withAuth(
  function middleware(req) {
    const path = req.nextUrl.pathname;
    const rule = RULES.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`));
    const role = req.nextauth.token?.role;
    if (rule && !roleSatisfies(role, rule.roles)) {
      if (path.startsWith("/api/")) {
        return role
          ? NextResponse.json({ error: "You do not have permission to do this." }, { status: 403 })
          : NextResponse.json({ error: "Please sign in." }, { status: 401 });
      }
      return NextResponse.rewrite(new URL("/forbidden", req.url), { status: 403 });
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Not signed in: pages redirect to the staff login; APIs get 401 from the route itself.
        if (req.nextUrl.pathname.startsWith("/api/")) return true;
        return !!token;
      },
    },
    pages: { signIn: "/staff/login" },
  },
);

export const config = {
  matcher: ["/admin/:path*", "/desk/:path*", "/scan/:path*", "/medical/:path*", "/coach/:path*", "/api/admin/:path*", "/api/desk/:path*", "/api/scan/:path*", "/api/medical/:path*", "/api/coach/:path*", "/score/:path*", "/api/score/:path*"],
};
