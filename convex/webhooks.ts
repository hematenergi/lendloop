import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { hmacSha256Hex } from "./lib/hmac";

const EVENT_STATUS = {
  "request.created": "pending",
  "request.approved": "approved",
  "request.declined": "declined",
  "request.cancelled": "cancelled",
  "request.returned": "returned",
} as const;

export const logNotification = internalMutation({
  args: {
    requestId: v.id("borrowRequests"),
    recipientId: v.id("users"),
    kind: v.string(),
    channel: v.string(),
    status: v.union(v.literal("logged"), v.literal("sent"), v.literal("failed")),
    message: v.string(),
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Event retries reuse their deterministic key instead of creating duplicate records.
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert("notifications", { ...args, createdAt: Date.now() });
  },
});

export const requestEvent = internalAction({
  args: {
    requestId: v.id("borrowRequests"),
    eventType: v.string(),
    actorId: v.id("users"),
    eventAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (!Object.hasOwn(EVENT_STATUS, args.eventType)) {
      throw new ConvexError("Unsupported request event type");
    }
    const status = EVENT_STATUS[args.eventType as keyof typeof EVENT_STATUS];
    const eventId = `${args.requestId}:${args.eventType}:${args.eventAt}`;
    const context = await ctx.runQuery(internal.requests.getEventContext, {
      requestId: args.requestId,
      actorId: args.actorId,
    });
    if (!context) throw new ConvexError("Request event context not found");

    const recipient = args.eventType === "request.created" || args.eventType === "request.cancelled"
      ? context.lender
      : args.eventType === "request.returned"
        ? context.lender
        : context.borrower;
    // Keep webhook data to the fields n8n needs; never send descriptions, condition, or other users' data.
    const payload = {
      eventId,
      type: args.eventType,
      occurredAt: new Date(args.eventAt).toISOString(),
      request: {
        id: String(context.request._id),
        status,
        startDate: context.request.startDate,
        endDate: context.request.endDate,
      },
      item: { name: context.item.name, category: context.item.category },
      recipient: { id: recipient.clerkId, email: recipient.email, name: recipient.name },
      actor: { name: context.actor.name },
    };

    const webhookUrl = process.env.N8N_REQUEST_WEBHOOK_URL?.trim();
    if (!webhookUrl) {
      await ctx.runMutation(internal.webhooks.logNotification, {
        requestId: args.requestId,
        recipientId: recipient._id,
        kind: args.eventType,
        channel: "none",
        status: "logged",
        message: "webhook URL not configured; event recorded locally",
        dedupeKey: eventId,
      });
      return;
    }

    const secret = process.env.WEBHOOK_HMAC_SECRET;
    if (!secret) {
      await ctx.runMutation(internal.webhooks.logNotification, {
        requestId: args.requestId,
        recipientId: recipient._id,
        kind: args.eventType,
        channel: "n8n-webhook",
        status: "failed",
        message: "WEBHOOK_HMAC_SECRET is not configured",
        dedupeKey: eventId,
      });
      throw new Error("Request webhook signing secret is not configured");
    }

    const body = JSON.stringify(payload);
    const signature = `sha256=${await hmacSha256Hex(secret, body)}`;
    let failure = "unknown error";
    let delivered = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-LendLoop-Signature": signature,
            "X-LendLoop-Event-Id": eventId,
          },
          body,
        });
        if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
        delivered = true;
        break;
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }

    if (delivered) {
      await ctx.runMutation(internal.webhooks.logNotification, {
        requestId: args.requestId,
        recipientId: recipient._id,
        kind: args.eventType,
        channel: "n8n-webhook",
        status: "sent",
        message: "Request event delivered to n8n",
        dedupeKey: eventId,
      });
      return;
    }

    await ctx.runMutation(internal.webhooks.logNotification, {
      requestId: args.requestId,
      recipientId: recipient._id,
      kind: args.eventType,
      channel: "n8n-webhook",
      status: "failed",
      message: failure,
      dedupeKey: eventId,
    });
    // A failed workflow must be visible in Convex logs as well as in the local notification log.
    throw new Error(`Request webhook failed after 3 attempts: ${failure}`);
  },
});
