import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getCurrentUser, requireAdmin } from "./lib/auth";
import { daysBetween, isValidDateRange, overlaps, todayISO } from "./lib/dates";

type RequestEventType =
  | "request.created"
  | "request.approved"
  | "request.declined"
  | "request.cancelled"
  | "request.returned";

async function scheduleRequestEvent(
  ctx: MutationCtx,
  requestId: Id<"borrowRequests">,
  eventType: RequestEventType,
  actorId: Id<"users">,
  eventAt: number,
) {
  await ctx.scheduler.runAfter(0, internal.webhooks.requestEvent, {
    requestId,
    eventType,
    actorId,
    eventAt,
  });
}

async function hasApprovedOverlap(
  ctx: QueryCtx | MutationCtx,
  itemId: Id<"items">,
  startDate: string,
  endDate: string,
  exceptId?: Id<"borrowRequests">,
) {
  const requests = await ctx.db
    .query("borrowRequests")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .collect();
  return requests.some((request) =>
    request._id !== exceptId &&
    request.status === "approved" &&
    overlaps(startDate, endDate, request.startDate, request.endDate),
  );
}

export const create = mutation({
  args: { itemId: v.id("items"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    const borrower = await getCurrentUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Item not found");
    if (borrower._id === item.ownerId) throw new ConvexError("You cannot borrow your own item");
    if (!isValidDateRange(args.startDate, args.endDate)) {
      throw new ConvexError("Start and end dates must be valid, with end on or after start");
    }
    if (args.startDate < todayISO()) throw new ConvexError("Start date cannot be in the past");
    if (await hasApprovedOverlap(ctx, item._id, args.startDate, args.endDate)) {
      throw new ConvexError("Item is already booked for part of that range");
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("borrowRequests", {
      itemId: item._id,
      borrowerId: borrower._id,
      lenderId: item.ownerId,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      reminderCount: 0,
    });
    await scheduleRequestEvent(ctx, requestId, "request.created", borrower._id, now);
    return requestId;
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const requests = await ctx.db
      .query("borrowRequests")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .collect();
    return Promise.all(requests.map(async (request) => {
      const [item, lender] = await Promise.all([
        ctx.db.get(request.itemId),
        ctx.db.get(request.lenderId),
      ]);
      return {
        ...request,
        itemName: item?.name ?? "Deleted item",
        lenderName: lender?.name ?? "Unknown neighbour",
      };
    }));
  },
});

export const listIncoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const requests = await ctx.db
      .query("borrowRequests")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .order("desc")
      .collect();
    return Promise.all(requests.map(async (request) => {
      const [item, borrower] = await Promise.all([
        ctx.db.get(request.itemId),
        ctx.db.get(request.borrowerId),
      ]);
      return {
        ...request,
        itemName: item?.name ?? "Deleted item",
        borrowerName: borrower?.name ?? "Unknown neighbour",
      };
    }));
  },
});

export const listAllLoansAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const requests = await ctx.db.query("borrowRequests").order("desc").collect();
    return Promise.all(requests.map(async (request) => {
      const [item, borrower, lender] = await Promise.all([
        ctx.db.get(request.itemId),
        ctx.db.get(request.borrowerId),
        ctx.db.get(request.lenderId),
      ]);
      return {
        ...request,
        itemName: item?.name ?? "Deleted item",
        borrowerName: borrower?.name ?? "Unknown neighbour",
        lenderName: lender?.name ?? "Unknown neighbour",
      };
    }));
  },
});

export const approve = mutation({
  args: { requestId: v.id("borrowRequests") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found");
    if (request.lenderId !== user._id) throw new ConvexError("Forbidden: lender only");
    if (request.status !== "pending") throw new ConvexError("Only pending requests can be approved");
    if (await hasApprovedOverlap(ctx, request.itemId, request.startDate, request.endDate, request._id)) {
      throw new ConvexError("Item is already booked for part of that range");
    }

    const now = Date.now();
    await ctx.db.patch(request._id, { status: "approved", decidedAt: now, updatedAt: now });
    await scheduleRequestEvent(ctx, request._id, "request.approved", user._id, now);
  },
});

export const decline = mutation({
  args: { requestId: v.id("borrowRequests") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found");
    if (request.lenderId !== user._id) throw new ConvexError("Forbidden: lender only");
    if (request.status !== "pending") throw new ConvexError("Only pending requests can be declined");

    const now = Date.now();
    await ctx.db.patch(request._id, { status: "declined", decidedAt: now, updatedAt: now });
    await scheduleRequestEvent(ctx, request._id, "request.declined", user._id, now);
  },
});

export const cancel = mutation({
  args: { requestId: v.id("borrowRequests") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found");
    if (request.borrowerId !== user._id) throw new ConvexError("Forbidden: borrower only");
    if (request.status !== "pending" && request.status !== "approved") {
      throw new ConvexError("Only pending or approved requests can be cancelled");
    }

    const now = Date.now();
    await ctx.db.patch(request._id, { status: "cancelled", updatedAt: now });
    await scheduleRequestEvent(ctx, request._id, "request.cancelled", user._id, now);
  },
});

export const markReturned = mutation({
  args: { requestId: v.id("borrowRequests") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found");
    if (request.borrowerId !== user._id && request.lenderId !== user._id) {
      throw new ConvexError("Forbidden: borrower or lender only");
    }
    if (request.status !== "approved") throw new ConvexError("Only approved requests can be marked returned");

    const now = Date.now();
    await ctx.db.patch(request._id, { status: "returned", returnedAt: now, updatedAt: now });
    await scheduleRequestEvent(ctx, request._id, "request.returned", user._id, now);
  },
});

export const getEventContext = internalQuery({
  args: { requestId: v.id("borrowRequests"), actorId: v.id("users") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;
    const [item, borrower, lender, actor] = await Promise.all([
      ctx.db.get(request.itemId),
      ctx.db.get(request.borrowerId),
      ctx.db.get(request.lenderId),
      ctx.db.get(args.actorId),
    ]);
    if (!item || !borrower || !lender || !actor) return null;
    return { request, item, borrower, lender, actor };
  },
});

export const listOverdueInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayISO();
    const approved = await ctx.db
      .query("borrowRequests")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();
    const overdue = approved.filter((request) => request.endDate < today);
    const rows = await Promise.all(overdue.map(async (request) => {
      const [item, borrower] = await Promise.all([
        ctx.db.get(request.itemId),
        ctx.db.get(request.borrowerId),
      ]);
      if (!item || !borrower) return null;
      return {
        requestId: request._id,
        itemName: item.name,
        borrowerEmail: borrower.email,
        borrowerName: borrower.name,
        endDate: request.endDate,
        daysOverdue: daysBetween(request.endDate, today),
        lastReminderDate: request.lastReminderDate,
        reminderCount: request.reminderCount,
      };
    }));
    return rows.filter((row) => row !== null);
  },
});

export const recordReminder = internalMutation({
  args: { requestId: v.string(), reminderDate: v.string() },
  handler: async (ctx, args) => {
    if (!isValidDateRange(args.reminderDate, args.reminderDate)) {
      throw new ConvexError("reminderDate must be a valid YYYY-MM-DD date");
    }
    const requestId = ctx.db.normalizeId("borrowRequests", args.requestId);
    if (!requestId) return { notFound: true, deduped: false };
    const request = await ctx.db.get(requestId);
    if (!request) return { notFound: true, deduped: false };
    const dedupeKey = `reminder:${request._id}:${args.reminderDate}`;
    // Ignore both same-day repeats and replays of an older acknowledgement.
    const notification = await ctx.db
      .query("notifications")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if (request.lastReminderDate === args.reminderDate || notification) {
      return { notFound: false, deduped: true };
    }

    const now = Date.now();
    await ctx.db.patch(request._id, {
      lastReminderDate: args.reminderDate,
      reminderCount: request.reminderCount + 1,
      updatedAt: now,
    });
    // The HTTP acknowledgement is only accepted after n8n sends the reminder.
    await ctx.db.insert("notifications", {
      requestId: request._id,
      recipientId: request.borrowerId,
      kind: "overdue_reminder",
      channel: "n8n",
      status: "sent",
      message: "Overdue reminder sent by n8n",
      dedupeKey,
      createdAt: now,
    });
    return { notFound: false, deduped: false };
  },
});
