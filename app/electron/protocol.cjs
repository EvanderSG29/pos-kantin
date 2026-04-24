const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { protocol, net } = require("electron");

function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

function registerAppProtocol(rootDir) {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "bundle") {
      return new Response("Not found", { status: 404 });
    }

    const rawPath = decodeURIComponent(url.pathname === "/" ? "/login.html" : url.pathname);
    const resolvedPath = path.normalize(path.join(rootDir, rawPath));
    if (!resolvedPath.startsWith(rootDir)) {
      return new Response("Forbidden", { status: 403 });
    }

    return net.fetch(pathToFileURL(resolvedPath).toString());
  });
}

module.exports = {
  registerAppProtocol,
  registerAppScheme,
};
