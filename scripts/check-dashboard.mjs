// Cek Dashboard dan mutasi tanpa jaringan dengan hook dan data tiruan.
// Jalankan: node scripts/check-dashboard.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName } from "convex/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { ConvexError } = require("convex/values");
const sourcePath = path.resolve("app/dashboard/page.tsx");
const queries = new Map();
const mutations = new Map();
const calls = [];
const slots = [];
const effects = [];
const timers = new Map();
let cursor = 0;
let confirmed = false;
let confirmation = "";
let reloads = 0;
let clerkAuth = { isLoaded: false, isSignedIn: false };
let convexAuth = { isLoading: true, isAuthenticated: false };
const redirects = [];
const router = { replace: (href) => redirects.push(href) };

const hooks = {
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  },
  useRef(initial) {
    const index = cursor++;
    return slots[index] ??= { current: initial };
  },
  useEffect(effect, deps) {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
      previous?.cleanup?.();
      slots[index] = { deps };
      effects.push(() => { slots[index].cleanup = effect(); });
    }
  },
};
const mutationFunctions = new Map();
const convex = {
  useConvexAuth() { return convexAuth; },
  useQuery(reference, args) { return args === "skip" ? undefined : queries.get(getFunctionName(reference)); },
  useMutation(reference) {
    const name = getFunctionName(reference);
    if (!mutationFunctions.has(name)) mutationFunctions.set(name, (args) => {
      calls.push({ name, args });
      return mutations.get(name)?.(args) ?? Promise.resolve();
    });
    return mutationFunctions.get(name);
  },
};

function load(filename, extra = "") {
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8") + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  });
  vm.runInNewContext(outputText, {
    module, exports: module.exports, Error, process: { env: {} },
    require(name) {
      if (name === "react") return { ...React, ...hooks };
      if (name === "convex/react") return convex;
      if (name === "@clerk/nextjs") return { useAuth: () => clerkAuth };
      if (name === "next/navigation") return { useRouter: () => router };
      if (name.startsWith("@/") || name.startsWith(".")) {
        const target = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(filename), name);
        return load(existsSync(`${target}.ts`) ? `${target}.ts` : `${target}.js`);
      }
      return require(name);
    },
    setTimeout(callback, delay) { const id = Symbol(); timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    window: { confirm(text) { confirmation = text; return confirmed; }, location: { reload() { reloads++; } } },
  }, { filename });
  return module.exports;
}

const { default: DashboardPage, DashboardContent, displayStatus, daysOverdue, StatusStrip } = load(sourcePath,
  "\nexport { DashboardContent, displayStatus, daysOverdue, StatusStrip };");
function render(Component = DashboardContent) {
  cursor = 0;
  const tree = Component();
  while (effects.length) effects.shift()();
  return tree;
}
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node.type === "function") return nodes(node.type(node.props));
  return [node, ...nodes(node.props?.children)];
}
const text = (node) => renderToStaticMarkup(node);
const find = (predicate) => { const node = nodes(render()).find(predicate); assert.ok(node, "element must exist"); return node; };
const button = (label) => find((node) => node.type === "button" && text(node).replace(/<[^>]*>/g, "") === label);
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const submit = () => find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
const change = (type, value, index = 0) => nodes(render()).filter((node) => node.type === "input" && node.props.type === type)[index].props.onChange({ target: { value } });
const deferred = (name) => {
  let resolve, reject;
  mutations.set(name, () => new Promise((yes, no) => { resolve = yes; reject = no; }));
  return { resolve: () => resolve(), reject: (reason) => reject(reason) };
};

clerkAuth = { isLoaded: true, isSignedIn: false };
assert.notEqual(render(DashboardPage).type, DashboardContent);
assert.deepEqual(redirects, ["/sign-in"]);
clerkAuth = { isLoaded: true, isSignedIn: true, sessionId: "signed-in" };
assert.notEqual(render(DashboardPage).type, DashboardContent);
assert.equal(calls.length, 0, "Clerk sign-in alone must not start profile setup");
convexAuth = { isLoading: false, isAuthenticated: true };
assert.equal(render(DashboardPage).type, DashboardContent);
clerkAuth = { isLoaded: true, isSignedIn: false };
assert.notEqual(render(DashboardPage).type, DashboardContent, "Sign-out must unmount queries even if Convex still reports a session");
assert.deepEqual(redirects, ["/sign-in", "/"]);
slots.length = 0;

const profile = { _id: "me", role: "user" };
const item = { _id: "drill", ownerId: "lender", name: "Drill", category: "tools", condition: "good", description: "Cordless drill", ownerName: "Neighbour", ownerTrusted: true, available: true };
queries.set("users:me", profile);
queries.set("items:listAll", [item, { ...item, _id: "mine", ownerId: "me" }, { ...item, _id: "borrowed", available: false }]);
queries.set("items:listMine", [{ ...item, _id: "mine", ownerId: "me" }]);
assert.equal(nodes(render()).filter((node) => node.props?.className === "card item-card").length, 3);
await flush();
queries.delete("users:me");
assert.doesNotMatch(text(render()), /Loading your profile|Setting up your profile/);
queries.set("users:me", profile);
assert.equal(nodes(render()).filter((node) => node.props?.role === "tab" && node.props["aria-selected"]).length, 1);
assert.match(text(render()), /3 of 3 items/);
assert.equal(nodes(render()).filter((node) => node.type === "button" && node.props.children === "Request").length, 1);
queries.set("items:listAll", undefined);
assert.equal(nodes(render()).filter((node) => node.props?.className === "card item-card").length, 6);
queries.set("items:listAll", [item]);
find((node) => node.type === "select").props.onChange({ target: { value: "missing-category" } });
assert.match(text(render()), /No items match this category/);
button("Clear filter").props.onClick();
assert.match(text(render()), /1 of 1 items/);
button("Request").props.onClick();
change("date", "2026-11-15");
change("date", "2026-11-14", 1);
submit();
assert.equal(calls.filter(({ name }) => name === "requests:create").length, 0);
assert.equal(nodes(render()).filter((node) => node.props?.["aria-invalid"] === true).length, 1);
assert.match(text(render()), /End date is before the start date/);
change("date", "2026-11-15", 1);
let pending = deferred("requests:create");
submit();
assert.equal(button("Sending…").props.disabled, true);
const requestFailure = new ConvexError("Start date cannot be in the past");
requestFailure.message = "[CONVEX M(requests:create)] [Request ID: example] at handler (../convex/requests.ts:59:53)";
pending.reject(requestFailure);
await flush();
assert.equal(button("Send request").props.disabled, false);
assert.match(text(render()), /Choose a start date of today or later/);
assert.doesNotMatch(text(render()), /CONVEX|Request ID|requests\.ts/);
assert.equal(timers.size, 0, "errors must not expire");
pending = deferred("requests:create");
submit();
pending.resolve();
await flush();
assert.match(text(render()), /✓ Request sent/);
assert.equal(button("Request").props.disabled, undefined);
assert.equal(timers.size, 1);
const [timer] = timers.values();
assert.equal(timer.delay, 6000);
timer.callback();
assert.doesNotMatch(text(render()), /Request sent/);

button("My listings").props.onClick();
assert.equal(find((node) => node.type === "input").props.maxLength, 80);
assert.equal(find((node) => node.type === "textarea").props.rows, 4);
assert.equal(nodes(render()).filter((node) => node.props?.className === "card listing-row").length, 1);
button("Delete").props.onClick();
assert.match(confirmation, /Drill/);
assert.equal(calls.filter(({ name }) => name === "items:remove").length, 0);
confirmed = true;
pending = deferred("items:remove");
button("Delete").props.onClick();
assert.equal(button("Deleting…").props.disabled, true);
pending.resolve();
await flush();
assert.match(text(render()), /✓ Listing deleted/);
pending = deferred("items:create");
submit();
assert.equal(button("Adding…").props.disabled, true);
pending.resolve();
await flush();
queries.set("items:listMine", undefined);
assert.equal(nodes(render()).filter((node) => node.props?.style?.height === 56).length, 3);
queries.set("items:listMine", []);
assert.match(text(render()), /You haven&#x27;t listed an item yet/);

const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = new Date();
const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
const approved = { status: "approved", endDate: iso(today) };
assert.equal(displayStatus(approved), "approved");
approved.endDate = iso(yesterday);
assert.equal(displayStatus(approved), "overdue");
assert.equal(daysOverdue(approved), 1);
assert.match(text(StatusStrip({ request: approved, context: "mine" })), /⚠ Overdue by 1 day</);
assert.match(text(StatusStrip({ request: { ...approved, status: "pending", lenderName: "Lender" }, context: "mine" })), /waiting for Lender/);
assert.match(text(StatusStrip({ request: { ...approved, status: "pending", borrowerName: "Borrower" }, context: "incoming" })), /requested by Borrower/);
assert.match(text(StatusStrip({ request: { ...approved, status: "returned", returnedAt: Date.UTC(2026, 10, 4) }, context: "mine" })), /Returned on Wed 4 Nov/);
for (const status of ["declined", "cancelled", "returned"]) assert.equal(displayStatus({ ...approved, status }), status);

for (const slot of slots) slot?.cleanup?.();
slots.length = 0;
mutations.set("users:ensureMe", () => Promise.reject(new Error("Profile setup failed.")));
render();
await flush();
assert.match(text(render()), /Please try again/);
assert.doesNotMatch(text(render()), /Profile setup failed/);
button("Try again").props.onClick();
assert.equal(reloads, 1);
console.log("PASS: auth gating, sign-out, profile recovery, date validation, safe errors, listing limit and dashboard interactions.");

const { create: createRequest } = load(path.resolve("convex/requests.ts"));
const { create: createItem } = load(path.resolve("convex/items.ts"));
const dates = { startDate: "2099-11-15", endDate: "2099-11-17" };
const existingRequest = { _id: "existing", itemId: item._id, borrowerId: profile._id, status: "pending", ...dates };
let existingRequests = [];
const ctx = {
  auth: { getUserIdentity: async () => ({ subject: "clerk-id" }) },
  db: {
    get: async () => item,
    query: (table) => ({
      withIndex: (_, where) => {
        const [key, value] = where({ eq: (...args) => args });
        return table === "users"
          ? { unique: async () => profile }
          : { collect: async () => existingRequests.filter((request) => request[key] === value) };
      },
    }),
    insert: async (_, data) => data,
  },
  scheduler: { runAfter: async () => {} },
};
const request = (range = dates) => createRequest._handler(ctx, { itemId: item._id, ...range });
existingRequests = [existingRequest];
await assert.rejects(request(), /Overlapping pending request/);
await assert.rejects(request({ startDate: dates.endDate, endDate: "2099-11-19" }), /Overlapping pending request/);
await request({ startDate: "2099-11-18", endDate: "2099-11-19" });
existingRequests = [
  { ...existingRequest, borrowerId: "someone-else" },
  { ...existingRequest, itemId: "another-item" },
  { ...existingRequest, status: "cancelled" },
];
await request();
existingRequests = [{ ...existingRequest, status: "approved" }];
await assert.rejects(request(), /Item is already booked/);

const listItem = (name) => createItem._handler(ctx, { name, category: "power-tools", condition: "good", description: "Cordless drill" });
await assert.rejects(listItem("   "), /Name is required/);
await assert.rejects(listItem("x".repeat(81)), /Name is too long/);
assert.equal((await listItem("x".repeat(80))).name.length, 80);
console.log("PASS: request overlap rules and server-side listing name validation.");
