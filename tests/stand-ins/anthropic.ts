import http from "node:http";

/** A local stand-in for the Anthropic Messages API, used ONLY by automated tests. */
export interface FakeAnthropic {
  url: string;
  key: string;
  /** Every request body received, so tests can assert what was (and was not) sent. */
  bodies: Record<string, unknown>[];
  setReply(text: string): void;
  close(): Promise<void>;
}

export async function startFakeAnthropic(port = 0, key = "sk-ant-stand-in"): Promise<FakeAnthropic> {
  let reply = "Soft, hard-wearing and easy to wash. [add sizes]";
  const bodies: Record<string, unknown>[] = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.url?.startsWith("/v1/messages") && req.method === "POST") {
        const presented = req.headers["x-api-key"] ?? String(req.headers.authorization ?? "").replace(/^Bearer /, "");
        if (presented !== key) return send(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
        let body: Record<string, unknown> = {};
        try {
          body = JSON.parse(raw);
        } catch {
          return send(400, { type: "error", error: { type: "invalid_request_error", message: "bad json" } });
        }
        bodies.push(body);
        return send(200, {
          id: "msg_stand_in",
          type: "message",
          role: "assistant",
          model: body.model,
          content: [{ type: "text", text: reply }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        });
      }
      send(404, { type: "error", error: { type: "not_found_error", message: "not found" } });
    });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}`, key, bodies, setReply: (t) => (reply = t), close: () => new Promise((r) => server.close(() => r())) };
}
