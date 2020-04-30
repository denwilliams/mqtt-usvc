import { createServer } from "http";
import { parse } from "url";
import { Service } from "./service";
import { register } from "prom-client";

export function startHttpServer(port: number, service: Service<any>) {
  console.log("Starting HTTP server on port " + port);
  const server = createServer((req, res) => {
    const sendResponse = (
      data: string,
      statusCode: number,
      headers?: Record<string, string>
    ) => {
      res.writeHead(statusCode, headers);
      res.end(data);
    };

    if (req.method === "GET" && req.url) {
      const parts = parse(req.url);
      if (parts.pathname === "/metrics") {
        sendResponse(register.metrics(), 200, {
          "Content-Type": "text/plain",
        });
        return;
      }
      if (parts.pathname === "/status") {
        if (service.mqttConnected) {
          sendResponse("OK", 200, {
            "Content-Type": "text/plain",
          });
        } else {
          sendResponse("Not OK", 500, {
            "Content-Type": "text/plain",
          });
        }
        return;
      }
    }
    sendResponse("Not found", 404, { "Content-Type": "text/plain" });
  });
  server.listen(port, () => {
    console.log("Server now listening on port " + port);
  });
  server.on("error", (err) => {
    console.error("HTTP server error " + err);
  });
}
