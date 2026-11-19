import net from "node:net";

/** A tiny SMTP server that keeps every message in memory. Used ONLY by automated tests; nothing is ever delivered. */
export interface Mail {
  from: string;
  to: string[];
  subject: string;
  body: string;
  raw: string;
}

export interface FakeSmtp {
  port: number;
  user: string;
  pass: string;
  messages: Mail[];
  close(): Promise<void>;
}

const decodeQuotedPrintable = (raw: string): string =>
  raw
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

function readSubject(head: string): string {
  const m = /^Subject:\s*(.*(?:\r?\n[ \t].*)*)/im.exec(head);
  const subject = (m?.[1] ?? "").replace(/\r?\n[ \t]/g, " ");
  return subject.replace(/=\?utf-8\?([bq])\?(.*?)\?=/gi, (_, kind: string, text: string) =>
    kind.toLowerCase() === "b" ? Buffer.from(text, "base64").toString("utf8") : decodeQuotedPrintable(text.replace(/_/g, " ")),
  );
}

export async function startFakeSmtp(port = 0, creds = { user: "mailer", pass: "mail-secret" }): Promise<FakeSmtp> {
  const messages: Mail[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((sock) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    sock.on("error", () => {});
    let buf = "";
    let mode: "cmd" | "data" | "auth-user" | "auth-pass" = "cmd";
    let from = "";
    let to: string[] = [];
    const send = (s: string) => sock.write(`${s}\r\n`);
    send("220 stand-in ESMTP");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (mode === "data") {
          const end = buf.indexOf("\r\n.\r\n");
          if (end === -1) return;
          const data = buf.slice(0, end);
          buf = buf.slice(end + 5);
          const [head, ...rest] = data.split(/\r?\n\r?\n/);
          messages.push({ from, to, subject: readSubject(head), body: decodeQuotedPrintable(rest.join("\n\n")), raw: data });
          mode = "cmd";
          send("250 queued");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl === -1) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        if (mode === "auth-user") {
          mode = "auth-pass";
          send("334 UGFzc3dvcmQ6");
          continue;
        }
        if (mode === "auth-pass") {
          mode = "cmd";
          send("235 ok");
          continue;
        }
        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) {
          sock.write("250-stand-in\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
        } else if (cmd.startsWith("AUTH PLAIN")) {
          const parts = Buffer.from(line.split(" ")[2] ?? "", "base64").toString().split("\0");
          if (parts[1] === creds.user && parts[2] === creds.pass) send("235 ok");
          else send("535 bad credentials");
        } else if (cmd.startsWith("AUTH LOGIN")) {
          mode = "auth-user";
          send("334 VXNlcm5hbWU6");
        } else if (cmd.startsWith("MAIL FROM")) {
          from = /<([^>]*)>/.exec(line)?.[1] ?? "";
          to = [];
          send("250 ok");
        } else if (cmd.startsWith("RCPT TO")) {
          to.push(/<([^>]*)>/.exec(line)?.[1] ?? "");
          send("250 ok");
        } else if (cmd === "DATA") {
          mode = "data";
          send("354 go ahead");
        } else if (cmd === "QUIT") {
          send("221 bye");
          sock.end();
        } else {
          send("250 ok");
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    port: (server.address() as net.AddressInfo).port,
    ...creds,
    messages,
    close: () =>
      new Promise<void>((resolve) => {
        sockets.forEach((s) => s.destroy());
        server.close(() => resolve());
      }),
  };
}
