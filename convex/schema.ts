import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
  }).index("by_clerkId", ["clerkId"]),
  items: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: v.string(),
    condition: v.union(v.literal("new"), v.literal("good"), v.literal("fair"), v.literal("worn")),
    description: v.string(),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),
  borrowRequests: defineTable({
    itemId: v.id("items"),
    borrowerId: v.id("users"),
    lenderId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("declined"),
      v.literal("cancelled"),
      v.literal("returned"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    lastReminderDate: v.optional(v.string()),
    reminderCount: v.number(),
  })
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_item", ["itemId"])
    .index("by_status", ["status"]),
  notifications: defineTable({
    requestId: v.id("borrowRequests"),
    recipientId: v.id("users"),
    kind: v.string(),
    channel: v.string(),
    status: v.union(v.literal("logged"), v.literal("sent"), v.literal("failed")),
    message: v.string(),
    dedupeKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_request", ["requestId"])
    .index("by_dedupeKey", ["dedupeKey"]),
});
