import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// /tabell/snack surfaces private WhatsApp-chat stats → signed-in members only.
const isProtectedRoute = createRouteMatcher([
  "/app(.*)",
  "/admin(.*)",
  "/tabell/snack(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
