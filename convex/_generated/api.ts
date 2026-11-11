// Hand-written equivalent of the generated files so the repo type-checks without a live Convex deployment. Regenerate with: npx convex dev
import { anyApi } from "convex/server";
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as items from "../items";
import type * as requests from "../requests";
import type * as seed from "../seed";
import type * as users from "../users";
import type * as webhooks from "../webhooks";

const fullApi = anyApi as unknown as ApiFromModules<{
  items: typeof items;
  requests: typeof requests;
  seed: typeof seed;
  users: typeof users;
  webhooks: typeof webhooks;
}>;

export const api: FilterApi<typeof fullApi, FunctionReference<any, "public">> = anyApi as any;
export const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">> = anyApi as any;
