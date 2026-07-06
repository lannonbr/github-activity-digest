import Fastify from "fastify";
import type { FastifyReply } from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./types.js";
import { readManifest, reportsDir } from "./reportManifest.js";
import { renderArchivePage } from "./renderReport.js";

export async function startServer(config: AppConfig): Promise<void> {
  const app = Fastify({ logger: true, disableRequestLogging: true });

  app.get("/", async (_request, reply) => {
    const manifest = await readManifest(config);
    return reply
      .type("text/html; charset=utf-8")
      .send(renderArchivePage(manifest.reports));
  });

  app.get("/styles.css", async (_request, reply) => {
    return reply
      .type("text/css; charset=utf-8")
      .send(await fs.readFile(path.resolve("public/styles.css"), "utf8"));
  });

  app.get("/reports/latest", async (_request, reply) => {
    return sendReportFile(reply, path.join(reportsDir(config), "latest.html"));
  });

  app.get<{ Params: { reportId: string } }>(
    "/reports/:reportId",
    async (request, reply) => {
      const manifest = await readManifest(config);
      const report = manifest.reports.find(
        (entry) => entry.id === request.params.reportId,
      );
      if (!report)
        return reply.code(404).type("text/plain").send("Report not found.");
      return sendReportFile(
        reply,
        path.join(reportsDir(config), report.fileName),
      );
    },
  );

  await app.listen({ host: config.server.host, port: config.server.port });
  console.log(`Server listening at ${config.server.publicBaseUrl}`);
}

async function sendReportFile(reply: FastifyReply, filePath: string) {
  try {
    return reply
      .type("text/html; charset=utf-8")
      .send(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return reply.code(404).type("text/plain").send("Report not found.");
    }
    throw error;
  }
}
