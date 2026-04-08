export default function middleware(req) {
  const url = new URL(req.url);

  // Allow PWA/static assets through without auth
  const publicPrefixes = [
    "/assets/",
    "/manifest.webmanifest",
    "/sw.js",
    "/registerSW.js",
    "/workbox-",
    "/pwa-",
    "/logo-site.svg",
    "/favicon.ico",
    "/robots.txt",
  ];
  if (publicPrefixes.some((p) => url.pathname.startsWith(p))) {
    return;
  }

  const auth = req.headers.get("authorization");
  if (auth) {
    try {
      const [scheme, encoded] = auth.split(" ");
      if (scheme === "Basic" && encoded) {
        const [user, ...passParts] = atob(encoded).split(":");
        const pass = passParts.join(":");

        if (
          user === process.env.BASIC_AUTH_USER &&
          pass === process.env.BASIC_AUTH_PASS
        ) {
          return;
        }
      }
    } catch {
      // Malformed auth header — fall through to 401
    }
  }
  return new Response("Non autorisé", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Accès privé"',
    },
  });
}
export const config = {
  runtime: "edge",
};
