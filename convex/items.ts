import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";
import { CATEGORY_VALUES } from "./lib/shared";

async function withAvailability(ctx: QueryCtx, item: Doc<"items">) {
  const requests = await ctx.db
    .query("borrowRequests")
    .withIndex("by_item", (q) => q.eq("itemId", item._id))
    .collect();
  return { ...item, available: !requests.some((request) => request.status === "approved") };
}

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    // Public catalogue intentionally exposes no owner, description, or document IDs.
    return (await ctx.db.query("items").collect())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, category }) => ({ name, category }));
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await getCurrentUser(ctx);
    const items = await ctx.db.query("items").collect();
    return Promise.all(items.map(async (item) => {
      const [availableItem, owner] = await Promise.all([
        withAvailability(ctx, item),
        ctx.db.get(item.ownerId),
      ]);
      return {
        ...availableItem,
        ownerName: owner?.name ?? "Unknown neighbour",
        ownerTrusted: owner?.trustedLender ?? false,
      };
    }));
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const items = await ctx.db
      .query("items")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    return Promise.all(items.map((item) => withAvailability(ctx, item)));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    condition: v.union(v.literal("new"), v.literal("good"), v.literal("fair"), v.literal("worn")),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!args.name.trim()) throw new ConvexError("Name is required");
    if (!args.description.trim()) throw new ConvexError("Description is required");
    if (!CATEGORY_VALUES.includes(args.category as (typeof CATEGORY_VALUES)[number])) {
      throw new ConvexError("Invalid category");
    }
    return ctx.db.insert("items", {
      ownerId: user._id,
      name: args.name.trim(),
      category: args.category,
      condition: args.condition,
      description: args.description.trim(),
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    itemId: v.id("items"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    condition: v.optional(v.union(v.literal("new"), v.literal("good"), v.literal("fair"), v.literal("worn"))),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Item not found");
    // Admins may remove another person's listing, but only its owner may edit it.
    if (item.ownerId !== user._id) throw new ConvexError("Forbidden: only the owner can edit this item");
    if (args.name !== undefined && !args.name.trim()) throw new ConvexError("Name is required");
    if (args.description !== undefined && !args.description.trim()) {
      throw new ConvexError("Description is required");
    }
    if (args.category !== undefined && !CATEGORY_VALUES.includes(args.category as (typeof CATEGORY_VALUES)[number])) {
      throw new ConvexError("Invalid category");
    }

    const patch: Partial<Pick<Doc<"items">, "name" | "category" | "condition" | "description">> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.category !== undefined) patch.category = args.category;
    if (args.condition !== undefined) patch.condition = args.condition;
    if (args.description !== undefined) patch.description = args.description.trim();
    await ctx.db.patch(args.itemId, patch);
  },
});

export const remove = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new ConvexError("Item not found");
    if (item.ownerId !== user._id && user.role !== "admin") {
      throw new ConvexError("Forbidden: owner or admin only");
    }
    // shortcut: request history retains references to removed listings, use soft deletion before supporting event replay.
    await ctx.db.delete(args.itemId);
  },
});
