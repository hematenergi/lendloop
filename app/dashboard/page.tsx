"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { CATEGORIES, CONDITIONS, categoryLabel, conditionLabel } from "@/lib/categories";
import type { Category, Condition } from "@/lib/categories";
import { formatDate } from "@/lib/format";

type Tab = "browse" | "listings" | "my-requests" | "incoming" | "admin";

const busyLabels = {
  request: "Sending…",
  addItem: "Adding…",
  delete: "Deleting…",
  approve: "Approving…",
  decline: "Declining…",
  cancel: "Cancelling…",
  returned: "Updating…",
  trust: "Updating…",
};

type RequestSummary = Pick<Doc<"borrowRequests">, "status" | "endDate" | "returnedAt"> & {
  lenderName?: string;
  borrowerName?: string;
};

function localTodayISO() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function displayStatus(request: RequestSummary) {
  return request.status === "approved" && request.endDate < localTodayISO() ? "overdue" : request.status;
}

function daysOverdue(request: RequestSummary) {
  return Math.round((new Date(`${localTodayISO()}T12:00:00`).getTime() - new Date(`${request.endDate}T12:00:00`).getTime()) / 86_400_000);
}

function StatusStrip({ request, context }: { request: RequestSummary; context: "mine" | "incoming" }) {
  const status = displayStatus(request);
  let text: string;
  switch (status) {
    case "pending":
      text = context === "mine" ? `Pending — waiting for ${request.lenderName}` : `Pending — requested by ${request.borrowerName}`;
      break;
    case "approved":
      text = `Approved — due back ${formatDate(request.endDate)}`;
      break;
    case "overdue": {
      const days = daysOverdue(request);
      text = `⚠ Overdue by ${days} ${days === 1 ? "day" : "days"}`;
      break;
    }
    case "returned":
      text = request.returnedAt === undefined ? "Returned" : `Returned on ${formatDate(new Date(request.returnedAt).toISOString().slice(0, 10))}`;
      break;
    default:
      text = status === "declined" ? "Declined" : "Cancelled";
  }
  return <div className={`status-strip ${status}`}>{text}</div>;
}

function SkeletonCards({ count }: { count: number }) {
  return (
    <div className="grid" role="status" aria-label="Loading items">
      {Array.from({ length: count }, (_, index) => (
        <div className="card item-card" key={index} aria-hidden="true">
          <div className="skeleton skel-title" />
          <div className="skeleton skel-badge" />
          <div className="skeleton skel-line" />
          <div className="skeleton skel-line" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <div className="card empty-state"><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function DashboardPage() {
  const ensureMe = useMutation(api.users.ensureMe);
  const createItem = useMutation(api.items.create);
  const removeItem = useMutation(api.items.remove);
  const createRequest = useMutation(api.requests.create);
  const approveRequest = useMutation(api.requests.approve);
  const declineRequest = useMutation(api.requests.decline);
  const cancelRequest = useMutation(api.requests.cancel);
  const markReturned = useMutation(api.requests.markReturned);
  const setTrustedLender = useMutation(api.users.setTrustedLender);

  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("browse");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [requestingItemId, setRequestingItemId] = useState<string | null>(null);
  const [requestDates, setRequestDates] = useState({ startDate: "", endDate: "" });
  const [requestError, setRequestError] = useState("");
  const [itemForm, setItemForm] = useState<{
    name: string;
    category: Category;
    condition: Condition;
    description: string;
  }>({ name: "", category: CATEGORIES[0].value, condition: CONDITIONS[1], description: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const setupStarted = useRef(false);

  useEffect(() => {
    if (setupStarted.current) return;
    setupStarted.current = true;
    ensureMe()
      .then(() => setReady(true))
      .catch((reason: unknown) => setError(messageFrom(reason)));
  }, [ensureMe]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const me = useQuery(api.users.me, ready ? {} : "skip");
  const items = useQuery(api.items.listAll, ready ? {} : "skip");
  const myItems = useQuery(api.items.listMine, ready ? {} : "skip");
  const myRequests = useQuery(api.requests.listMine, ready ? {} : "skip");
  const incomingRequests = useQuery(api.requests.listIncoming, ready ? {} : "skip");
  const isAdmin = me?.role === "admin";
  const adminLoans = useQuery(api.requests.listAllLoansAdmin, ready && isAdmin ? {} : "skip");
  const users = useQuery(api.users.listAll, ready && isAdmin ? {} : "skip");

  async function run(action: Promise<unknown>, successMessage?: string, key?: string) {
    setError("");
    setNotice("");
    setBusyKey(key ?? null);
    try {
      await action;
      if (successMessage) setNotice(successMessage);
      return true;
    } catch (reason) {
      setError(messageFrom(reason));
      return false;
    } finally {
      setBusyKey((current) => current === key ? null : current);
    }
  }

  if (!ready || me === undefined) {
    return (
      <section aria-busy={!error} aria-label="Dashboard">
        {error ? (
          <>
            <p className="error" role="alert">⚠ {error}</p>
            <button className="button button-secondary" type="button" onClick={() => window.location.reload()}>Try again</button>
          </>
        ) : (
          <>
            <div className="skeleton skel-title" aria-hidden="true" />
            <div className="tabs" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => <div className="skeleton skel-badge" key={index} />)}
            </div>
            <SkeletonCards count={3} />
          </>
        )}
      </section>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "browse", label: "Browse" },
    { key: "listings", label: "My listings" },
    { key: "my-requests", label: "My requests" },
    { key: "incoming", label: "Incoming requests" },
    ...(isAdmin ? [{ key: "admin" as const, label: "Admin" }] : []),
  ];

  const visibleItems = items?.filter((item) => categoryFilter === "all" || item.category === categoryFilter);

  return (
    <section>
      <h1>Dashboard</h1>
      <div className="tabs" role="tablist" aria-label="Dashboard sections">
        {tabs.map((tab) => (
          <button
            className={`tab ${activeTab === tab.key ? "active" : ""}`}
            id={`tab-${tab.key}`}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`panel-${tab.key}`}
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="error" role="alert">⚠ {error}</p>}
      {notice && <p className="success" role="status">✓ {notice}</p>}

      {activeTab === "browse" && (
        <section className="tab-panel" role="tabpanel" id="panel-browse" aria-labelledby="tab-browse">
          <div className="filter-row">
            <label>
              Filter category
              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">All categories</option>
                {CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
            </label>
            {items !== undefined && <span className="caption num">{visibleItems?.length} of {items.length} items</span>}
          </div>
          {items === undefined ? (
            <SkeletonCards count={6} />
          ) : visibleItems?.length === 0 ? (
            <EmptyState
              title="No items match this category."
              body="Try a different category, or browse everything your neighbours listed."
              action={<button className="text-link" type="button" onClick={() => setCategoryFilter("all")}>Clear filter</button>}
            />
          ) : (
            <div className="grid">
              {visibleItems?.map((item) => {
                const isMine = item.ownerId === me?._id;
                return (
                  <article className="card item-card" key={item._id}>
                    <h2>{item.name}</h2>
                    <div className="badge-row">
                      <span className="badge">{categoryLabel(item.category)}</span>
                      <span className="badge condition">{conditionLabel(item.condition)}</span>
                      <StatusBadge status={item.available ? "available" : "borrowed"} />
                    </div>
                    <p className="description clamp-3">{item.description}</p>
                    <div className="badge-row">
                      <span className="caption">Lent by {item.ownerName}</span>
                      {item.ownerTrusted && <span className="trusted-badge">Trusted Lender</span>}
                    </div>
                    <div className="card-actions">
                      {isMine ? (
                        <span className="caption">Yours</span>
                      ) : item.available ? (
                        requestingItemId === item._id ? (
                          <form
                            className="form request-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              if (requestDates.startDate && requestDates.endDate && requestDates.endDate < requestDates.startDate) {
                                setRequestError("End date is before the start date.");
                                return;
                              }
                              setRequestError("");
                              void (async () => {
                                const sent = await run(createRequest({ itemId: item._id, ...requestDates }), "Request sent.", `request:${item._id}`);
                                if (sent) {
                                  setRequestingItemId(null);
                                  setRequestDates({ startDate: "", endDate: "" });
                                }
                              })();
                            }}
                          >
                            <div className="form-row">
                              <label>
                                Start date
                                <input
                                  type="date"
                                  required
                                  value={requestDates.startDate}
                                  onChange={(event) => {
                                    setRequestDates({ ...requestDates, startDate: event.target.value });
                                    setRequestError("");
                                  }}
                                />
                              </label>
                              <label>
                                End date
                                <input
                                  type="date"
                                  required
                                  aria-invalid={!!requestError}
                                  aria-describedby={requestError ? `request-error-${item._id}` : undefined}
                                  value={requestDates.endDate}
                                  onChange={(event) => {
                                    setRequestDates({ ...requestDates, endDate: event.target.value });
                                    setRequestError("");
                                  }}
                                />
                                {requestError && <span className="field-error" id={`request-error-${item._id}`}>{requestError}</span>}
                              </label>
                            </div>
                            <div className="form-actions card-actions">
                              <button className="button button-primary" type="submit" disabled={busyKey === `request:${item._id}`}>
                                {busyKey === `request:${item._id}` ? busyLabels.request : "Send request"}
                              </button>
                              <button
                                className="button button-secondary"
                                type="button"
                                onClick={() => {
                                  setRequestingItemId(null);
                                  setRequestDates({ startDate: "", endDate: "" });
                                  setRequestError("");
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <button
                            className="button button-primary"
                            type="button"
                            onClick={() => {
                              setRequestDates({ startDate: "", endDate: "" });
                              setRequestError("");
                              setRequestingItemId(item._id);
                            }}
                          >
                            Request
                          </button>
                        )
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === "listings" && (
        <section className="tab-panel" role="tabpanel" id="panel-listings" aria-labelledby="tab-listings">
          <div className="card form-card">
            <h2>Add an item</h2>
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  if (await run(createItem(itemForm), "Item added.", "addItem")) {
                    setItemForm({ name: "", category: CATEGORIES[0].value, condition: CONDITIONS[1], description: "" });
                  }
                })();
              }}
            >
              <label>
                Name
                <input
                  required
                  value={itemForm.name}
                  onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })}
                />
              </label>
              <div className="form-row">
                <label>
                  Category
                  <select
                    value={itemForm.category}
                    onChange={(event) => setItemForm({ ...itemForm, category: event.target.value as Category })}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>{category.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Condition
                  <select
                    value={itemForm.condition}
                    onChange={(event) => setItemForm({ ...itemForm, condition: event.target.value as Condition })}
                  >
                    {CONDITIONS.map((condition) => (
                      <option key={condition} value={condition}>{conditionLabel(condition)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Description
                <textarea
                  required
                  rows={4}
                  value={itemForm.description}
                  onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })}
                />
              </label>
              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={busyKey === "addItem"}>
                  {busyKey === "addItem" ? busyLabels.addItem : "Add item"}
                </button>
              </div>
            </form>
          </div>
          {myItems === undefined ? (
            <div className="tab-panel" role="status" aria-label="Loading your listings">
              {Array.from({ length: 3 }, (_, index) => <div className="skeleton" style={{ height: 56 }} key={index} aria-hidden="true" />)}
            </div>
          ) : myItems.length === 0 ? (
            <EmptyState title="You haven't listed an item yet." body="List a tool you rarely use — a neighbour probably needs it." />
          ) : (
            <div className="tab-panel">
              {myItems.map((item) => (
                <article className="card listing-row" key={item._id}>
                  <div className="badge-row">
                    <strong>{item.name}</strong>
                    <span className="badge">{categoryLabel(item.category)}</span>
                    <span className="badge condition">{conditionLabel(item.condition)}</span>
                  </div>
                  <button
                    className="button button-danger"
                    type="button"
                    disabled={busyKey === `delete:${item._id}`}
                    onClick={() => window.confirm(`Delete “${item.name}”?`) && void run(removeItem({ itemId: item._id }), "Listing deleted.", `delete:${item._id}`)}
                  >
                    {busyKey === `delete:${item._id}` ? busyLabels.delete : "Delete"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "my-requests" && (
        <section className="tab-panel" role="tabpanel" id="panel-my-requests" aria-labelledby="tab-my-requests">
          {myRequests === undefined ? (
            <p className="muted">Loading your requests…</p>
          ) : myRequests.length === 0 ? (
            <p className="muted">You haven&apos;t requested an item yet.</p>
          ) : (
            <div className="grid">
              {myRequests.map((request) => (
                <article className="card item-card" key={request._id}>
                  <h2>{request.itemName}</h2>
                  <p>Lender: {request.lenderName}</p>
                  <p>{request.startDate} — {request.endDate}</p>
                  <StatusBadge status={request.status} />
                  {request.reminderCount > 0 && (
                    <p className="muted">
                      Overdue reminder sent ×{request.reminderCount} · last {request.lastReminderDate ?? "unknown"}
                    </p>
                  )}
                  <div className="form-actions">
                    {(request.status === "pending" || request.status === "approved") && (
                      <button className="button button-secondary" type="button" disabled={busyKey === `cancel:${request._id}`} onClick={() => void run(cancelRequest({ requestId: request._id }), "Request cancelled.", `cancel:${request._id}`)}>
                        {busyKey === `cancel:${request._id}` ? busyLabels.cancel : "Cancel"}
                      </button>
                    )}
                    {request.status === "approved" && (
                      <button className="button button-primary" type="button" disabled={busyKey === `returned:${request._id}`} onClick={() => void run(markReturned({ requestId: request._id }), "Item marked returned.", `returned:${request._id}`)}>
                        {busyKey === `returned:${request._id}` ? busyLabels.returned : "Mark returned"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "incoming" && (
        <section className="tab-panel" role="tabpanel" id="panel-incoming" aria-labelledby="tab-incoming">
          {incomingRequests === undefined ? (
            <p className="muted">Loading incoming requests…</p>
          ) : incomingRequests.length === 0 ? (
            <p className="muted">No one has requested your items yet.</p>
          ) : (
            <div className="grid">
              {incomingRequests.map((request) => (
                <article className="card item-card" key={request._id}>
                  <h2>{request.itemName}</h2>
                  <p>Borrower: {request.borrowerName}</p>
                  <p>{request.startDate} — {request.endDate}</p>
                  <StatusBadge status={request.status} />
                  <div className="form-actions">
                    {request.status === "pending" && (
                      <>
                        <button className="button button-primary" type="button" disabled={busyKey === `approve:${request._id}`} onClick={() => void run(approveRequest({ requestId: request._id }), "Request approved.", `approve:${request._id}`)}>
                          {busyKey === `approve:${request._id}` ? busyLabels.approve : "Approve"}
                        </button>
                        <button className="button button-secondary" type="button" disabled={busyKey === `decline:${request._id}`} onClick={() => void run(declineRequest({ requestId: request._id }), "Request declined.", `decline:${request._id}`)}>
                          {busyKey === `decline:${request._id}` ? busyLabels.decline : "Decline"}
                        </button>
                      </>
                    )}
                    {request.status === "approved" && (
                      <button className="button button-primary" type="button" disabled={busyKey === `returned:${request._id}`} onClick={() => void run(markReturned({ requestId: request._id }), "Item marked returned.", `returned:${request._id}`)}>
                        {busyKey === `returned:${request._id}` ? busyLabels.returned : "Mark returned"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "admin" && isAdmin && (
        <section className="tab-panel admin-panel" role="tabpanel" id="panel-admin" aria-labelledby="tab-admin">
          <section className="card admin-section">
            <h2>All loans</h2>
            {adminLoans === undefined ? (
              <p className="muted">Loading loans…</p>
            ) : adminLoans.length === 0 ? (
              <p className="muted">No loans yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Item</th><th>Borrower</th><th>Lender</th><th>Dates</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {adminLoans.map((loan) => (
                      <tr key={loan._id}>
                        <td>{loan.itemName}</td>
                        <td>{loan.borrowerName}</td>
                        <td>{loan.lenderName}</td>
                        <td>{loan.startDate} — {loan.endDate}</td>
                        <td><StatusBadge status={loan.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card admin-section">
            <h2>Users</h2>
            {users === undefined ? (
              <p className="muted">Loading users…</p>
            ) : users.length === 0 ? (
              <p className="muted">No users found.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Name</th><th>Email</th><th>Role</th><th>Trusted lender</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user._id}>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
                        <td>
                          <span className={`trusted-badge ${user.trustedLender ? "" : "untrusted"}`}>
                            {user.trustedLender ? "Trusted Lender" : "Not trusted"}
                          </span>
                        </td>
                        <td>
                          <button
                            className="button button-secondary"
                            type="button"
                            aria-pressed={user.trustedLender}
                            disabled={busyKey === `trust:${user._id}`}
                            onClick={() => void run(setTrustedLender({ userId: user._id, trusted: !user.trustedLender }), user.trustedLender ? "Trust removed." : "Lender marked trusted.", `trust:${user._id}`)}
                          >
                            {busyKey === `trust:${user._id}` ? busyLabels.trust : user.trustedLender ? "Remove trust" : "Mark trusted"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card admin-section">
            <h2>Delete any listing</h2>
            {items === undefined ? (
              <p className="muted">Loading listings…</p>
            ) : items.length === 0 ? (
              <p className="muted">No listings found.</p>
            ) : (
              <div className="grid">
                {items.map((item) => (
                  <article className="admin-listing" key={item._id}>
                    <div>
                      <strong>{item.name}</strong>
                      <p className="muted">{item.ownerName} · {categoryLabel(item.category)}</p>
                    </div>
                    <button
                      className="button button-danger"
                      type="button"
                      disabled={busyKey === `delete:${item._id}`}
                      onClick={() => window.confirm(`Delete “${item.name}”?`) && void run(removeItem({ itemId: item._id }), "Listing deleted.", `delete:${item._id}`)}
                    >
                      {busyKey === `delete:${item._id}` ? busyLabels.delete : "Delete"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      )}
    </section>
  );
}
