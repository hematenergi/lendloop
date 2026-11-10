import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx;

export function isAdminSubject(subject: string): boolean {
  // Admin identities come from server configuration, never from client input.
  return (process.env.ADMIN_CLERK_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(subject);
}

export async function getCurrentUser(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Unauthenticated");

  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (existing) return existing;

  // Convex queries are read-only; first-time users must call ensureMe before using other queries.
  if (!("insert" in ctx.db)) throw new ConvexError("User profile missing; call users.ensureMe first");
  const userId = await (ctx as MutationCtx).db.insert("users", {
    clerkId: identity.subject,
    email: identity.email ?? "",
    name: identity.name ?? identity.email ?? "Neighbour",
    role: isAdminSubject(identity.subject) ? "admin" : "user",
    trustedLender: false,
  });
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("Could not provision user");
  return user;
}

export async function getOptionalUser(ctx: AuthCtx) {
  if (!(await ctx.auth.getUserIdentity())) return null;
  return getCurrentUser(ctx);
}

export async function requireAdmin(ctx: AuthCtx) {
  // Authorization always uses the authenticated Clerk subject's stored role.
  const user = await getCurrentUser(ctx);
  if (user.role !== "admin") throw new ConvexError("Forbidden: admin only");
  return user;
}
