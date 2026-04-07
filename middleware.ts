export default function middleware(req) {
  // Allow PWA assets through without auth so Chrome can install the PWA
  const url = new URL(req.url);
  const publicPaths = ["/manifest.webmanifest", "/sw.js", "/registerSW.js", "/workbox-", "/pwa-", "/logo-site.svg"];
  if (publicPaths.some((p) => url.pathname.startsWith(p))) {
    return;
  }

  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");

    if (scheme === "Basic") {
      const [user, pass] = atob(encoded).split(":");

      if (
        user === process.env.BASIC_AUTH_USER &&
        pass === process.env.BASIC_AUTH_PASS
      ) {
        return;
      }
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
