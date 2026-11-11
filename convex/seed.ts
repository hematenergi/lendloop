import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { CATEGORY_VALUES } from "./lib/shared";

type UserSeed = Pick<Doc<"users">, "email" | "name" | "role" | "trustedLender">;
type ItemSeed = {
  ownerId: Id<"users">;
  name: string;
  category: (typeof CATEGORY_VALUES)[number];
  condition: Doc<"items">["condition"];
  description: string;
};
type RequestSeed = Pick<
  Doc<"borrowRequests">,
  "itemId" | "borrowerId" | "lenderId" | "startDate" | "endDate" | "status" | "reminderCount"
> & Partial<Pick<Doc<"borrowRequests">, "decidedAt" | "returnedAt" | "lastReminderDate">>;

const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayOffset = (n: number) => fmtDate(Date.now() + n * 86400000);

export const seedDemo = internalMutation({
  args: { primaryClerkId: v.optional(v.string()), adminClerkId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const getOrCreateUser = async (clerkId: string, fields: UserSeed, patchRole = true) => {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
        .unique();
      if (!existing) {
        const id = await ctx.db.insert("users", { clerkId, ...fields });
        const user = await ctx.db.get(id);
        if (!user) throw new Error("Inserted user not found");
        return user;
      }

      const patch: Partial<UserSeed> = {};
      if (existing.email !== fields.email) patch.email = fields.email;
      if (existing.name !== fields.name) patch.name = fields.name;
      if (patchRole && existing.role !== fields.role) patch.role = fields.role;
      if (existing.trustedLender !== fields.trustedLender) patch.trustedLender = fields.trustedLender;
      if (Object.keys(patch).length) {
        await ctx.db.patch(existing._id, patch);
        return { ...existing, ...patch };
      }
      return existing;
    };

    const getOrCreateDemoUser = (clerkId: string, fields: UserSeed) =>
      getOrCreateUser(clerkId, fields, clerkId !== args.primaryClerkId || clerkId === args.adminClerkId);

    const getOrCreateItem = async (
      ownerId: Id<"users">,
      name: string,
      category: ItemSeed["category"],
      condition: ItemSeed["condition"],
      description: string,
    ) => {
      const items = await ctx.db.query("items").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
      const existing = items.find((item) => item.name === name);
      if (existing) return existing;
      const id = await ctx.db.insert("items", { ownerId, name, category, condition, description, createdAt: Date.now() });
      const item = await ctx.db.get(id);
      if (!item) throw new Error("Inserted item not found");
      return item;
    };

    const getOrCreateRequest = async (fields: RequestSeed) => {
      const requests = await ctx.db
        .query("borrowRequests")
        .withIndex("by_borrower", (q) => q.eq("borrowerId", fields.borrowerId))
        .collect();
      const existing = requests.find((request) =>
        request.itemId === fields.itemId &&
        request.startDate === fields.startDate &&
        request.endDate === fields.endDate,
      );
      const updatedAt = Date.now();
      if (existing) {
        await ctx.db.patch(existing._id, {
          status: fields.status,
          decidedAt: fields.decidedAt,
          returnedAt: fields.returnedAt,
          lastReminderDate: fields.lastReminderDate,
          reminderCount: fields.reminderCount,
          updatedAt,
        });
        return {
          ...existing,
          status: fields.status,
          decidedAt: fields.decidedAt,
          returnedAt: fields.returnedAt,
          lastReminderDate: fields.lastReminderDate,
          reminderCount: fields.reminderCount,
          updatedAt,
        };
      }
      const id = await ctx.db.insert("borrowRequests", { ...fields, createdAt: updatedAt, updatedAt });
      const request = await ctx.db.get(id);
      if (!request) throw new Error("Inserted request not found");
      return request;
    };

    const users = [
      await getOrCreateDemoUser("demo-lender-1", {
        email: "demo.lender1@lendloop.test", name: "Dana Lender", role: "user", trustedLender: true,
      }),
      await getOrCreateDemoUser("demo-lender-2", {
        email: "demo.lender2@lendloop.test", name: "Rian Purnama", role: "user", trustedLender: false,
      }),
      await getOrCreateDemoUser("demo-borrower-1", {
        email: "demo.borrower1@lendloop.test", name: "Sari Utami", role: "user", trustedLender: false,
      }),
    ];

    let primaryUser: Doc<"users"> | undefined;
    if (args.primaryClerkId) {
      primaryUser = await getOrCreateUser(args.primaryClerkId, {
        email: "primary@lendloop.test", name: "Primary Tester", role: "user", trustedLender: false,
      }, false);
      users.push(primaryUser);
    }
    if (args.adminClerkId) {
      users.push(await getOrCreateUser(args.adminClerkId, {
        email: "admin@lendloop.test", name: "Admin Tester", role: "admin", trustedLender: false,
      }));
    }

    const [lender1, lender2, borrower] = users;
    const itemSeeds: ItemSeed[] = [
      { ownerId: lender1._id, name: "Demo — Bosch Cordless Drill", category: "power-tools", condition: "good", description: "18V cordless drill, two batteries and a full bit set." },
      { ownerId: lender1._id, name: "Demo — Extendable Ladder 4m", category: "power-tools", condition: "fair", description: "Aluminium ladder, extends to 4 metres. One slightly sticky rung." },
      { ownerId: lender2._id, name: "Demo — Garden Hose 30m + Reel", category: "garden", condition: "good", description: "30 metre hose on a reel with spray nozzle." },
      { ownerId: lender2._id, name: "Demo — Pressure Washer", category: "garden", condition: "new", description: "Compact electric pressure washer for patios and bikes." },
      { ownerId: lender1._id, name: "Demo — Stand Mixer 5L", category: "kitchen", condition: "good", description: "5 litre stand mixer with dough hook and whisk." },
      { ownerId: lender2._id, name: "Demo — Camping Tent for 4", category: "camping", condition: "good", description: "Four-person tent, used twice, all pegs included." },
      { ownerId: lender1._id, name: "Demo — Badminton Set", category: "sports", condition: "worn", description: "Two rackets and a net; shuttlecocks not included." },
      { ownerId: lender2._id, name: "Demo — Bluetooth Speaker", category: "electronics", condition: "good", description: "Portable speaker, about 10 hours per charge." },
    ];
    const items: Doc<"items">[] = [];
    for (const item of itemSeeds) {
      items.push(await getOrCreateItem(item.ownerId, item.name, item.category, item.condition, item.description));
    }

    const now = Date.now();
    const requests: Doc<"borrowRequests">[] = [
      await getOrCreateRequest({
        itemId: items[5]._id, borrowerId: borrower._id, lenderId: lender2._id,
        startDate: dayOffset(-1), endDate: dayOffset(2), status: "approved", decidedAt: now, reminderCount: 0,
      }),
    ];

    if (primaryUser) {
      const primaryItem = await getOrCreateItem(
        primaryUser._id, "Demo — Folding Chairs (Set of 4)", "other", "good", "A set of four folding chairs for guests.",
      );
      items.push(primaryItem);
      items.push(await getOrCreateItem(
        primaryUser._id, "Demo — Air Pump", "sports", "good", "A compact hand pump with needle adapter.",
      ));
      requests.push(await getOrCreateRequest({
        itemId: primaryItem._id, borrowerId: borrower._id, lenderId: primaryUser._id,
        startDate: dayOffset(3), endDate: dayOffset(5), status: "pending", reminderCount: 0,
      }));
      requests.push(await getOrCreateRequest({
        itemId: items[0]._id, borrowerId: primaryUser._id, lenderId: lender1._id,
        startDate: dayOffset(3), endDate: dayOffset(4), status: "pending", reminderCount: 0,
      }));
      requests.push(await getOrCreateRequest({
        itemId: items[2]._id, borrowerId: primaryUser._id, lenderId: lender2._id,
        startDate: dayOffset(-1), endDate: dayOffset(2), status: "approved", decidedAt: now, reminderCount: 0,
      }));
      requests.push(await getOrCreateRequest({
        itemId: items[3]._id, borrowerId: primaryUser._id, lenderId: lender2._id,
        startDate: dayOffset(-6), endDate: dayOffset(-2), status: "approved", decidedAt: now,
        lastReminderDate: dayOffset(-1), reminderCount: 2,
      }));
      requests.push(await getOrCreateRequest({
        itemId: items[4]._id, borrowerId: primaryUser._id, lenderId: lender1._id,
        startDate: dayOffset(-12), endDate: dayOffset(-10), status: "returned",
        decidedAt: now, returnedAt: now - 10 * 86400000, reminderCount: 0,
      }));
      requests.push(await getOrCreateRequest({
        itemId: items[6]._id, borrowerId: primaryUser._id, lenderId: lender1._id,
        startDate: dayOffset(-4), endDate: dayOffset(-3), status: "declined", decidedAt: now, reminderCount: 0,
      }));
    }

    return {
      users: new Set(users.map((user) => user._id)).size,
      items: new Set(items.map((item) => item._id)).size,
      requests: new Set(requests.map((request) => request._id)).size,
    };
  },
});

export const clearDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const items = (await ctx.db.query("items").collect()).filter((item) => item.name.startsWith("Demo — "));
    let requests = 0;
    let notifications = 0;
    for (const item of items) {
      const itemRequests = await ctx.db
        .query("borrowRequests")
        .withIndex("by_item", (q) => q.eq("itemId", item._id))
        .collect();
      for (const request of itemRequests) {
        const requestNotifications = await ctx.db
          .query("notifications")
          .withIndex("by_request", (q) => q.eq("requestId", request._id))
          .collect();
        for (const notification of requestNotifications) {
          await ctx.db.delete(notification._id);
          notifications++;
        }
        await ctx.db.delete(request._id);
        requests++;
      }
      await ctx.db.delete(item._id);
    }

    const users = (await ctx.db.query("users").collect()).filter((user) => user.clerkId.startsWith("demo-"));
    for (const user of users) await ctx.db.delete(user._id);
    return { items: items.length, requests, notifications, users: users.length };
  },
});
