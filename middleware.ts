export default function middleware(req) {
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
