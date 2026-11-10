import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { isValidDateRange } from "./lib/dates";
import { hmacSha256Hex } from "./lib/hmac";

const http = httpRouter();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  // Compare the full input so a matching signature prefix is not exposed.
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

http.route({
  path: "/api/overdue",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.CONVEX_HTTP_SECRET;
    if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) {
      return json({ error: "Unauthorized" }, 401);
    }
    const overdue = await ctx.runQuery(internal.requests.listOverdueInternal, {});
    return json({ generatedAt: new Date().toISOString(), count: overdue.length, overdue });
  }),
});

http.route({
  path: "/api/reminders/ack",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // WEBHOOK_HMAC_SECRET signs both Convex-to-n8n events and n8n acknowledgements; CONVEX_HTTP_SECRET only guards GET /api/overdue.
    const secret = process.env.WEBHOOK_HMAC_SECRET;
    if (!secret) return json({ error: "Unauthorized" }, 401);
    const rawBody = await request.text();
    const expected = `sha256=${await hmacSha256Hex(secret, rawBody)}`;
    const supplied = request.headers.get("X-LendLoop-Signature") ?? "";
    if (!constantTimeEqual(expected, supplied)) return json({ error: "Unauthorized" }, 401);

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    if (
      typeof body !== "object" || body === null ||
      !("requestId" in body) || typeof body.requestId !== "string" || !body.requestId.trim() ||
      !("reminderDate" in body) || typeof body.reminderDate !== "string" ||
      !isValidDateRange(body.reminderDate, body.reminderDate)
    ) {
      return json({ error: "Body must contain a requestId and a valid reminderDate" }, 400);
    }

    try {
      const result = await ctx.runMutation(internal.requests.recordReminder, {
        requestId: body.requestId,
        reminderDate: body.reminderDate,
      });
      if (result.notFound) return json({ error: "Request not found" }, 404);
      return json({ ok: true, deduped: result.deduped });
    } catch (error) {
      if (error instanceof ConvexError) return json({ error: "Request not found" }, 404);
      throw error;
    }
  }),
});

export default http;
