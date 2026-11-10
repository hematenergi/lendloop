import { ConvexError, v } from "convex/values";
import { getCurrentUser, getOptionalUser, requireAdmin } from "./lib/auth";
import { mutation, query } from "./_generated/server";

export const me = query({
  args: {},
  handler: (ctx) => getOptionalUser(ctx),
});

export const ensureMe = mutation({
  args: {},
  handler: (ctx) => getCurrentUser(ctx),
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError("User not found");
    await ctx.db.patch(args.userId, { trustedLender: args.trusted });
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query("users").collect();
  },
});
