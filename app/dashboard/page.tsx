"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { CATEGORIES, CONDITIONS, categoryLabel, conditionLabel } from "@/lib/categories";
import type { Category, Condition } from "@/lib/categories";

type Tab = "browse" | "listings" | "my-requests" | "incoming" | "admin";

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
  const [itemForm, setItemForm] = useState<{
    name: string;
    category: Category;
    condition: Condition;
    description: string;
  }>({ name: "", category: CATEGORIES[0].value, condition: CONDITIONS[1], description: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const setupStarted = useRef(false);

  useEffect(() => {
    if (setupStarted.current) return;
    setupStarted.current = true;
    ensureMe()
      .then(() => setReady(true))
      .catch((reason: unknown) => setError(messageFrom(reason)));
  }, [ensureMe]);

  const me = useQuery(api.users.me, ready ? {} : "skip");
  const items = useQuery(api.items.listAll, ready ? {} : "skip");
  const myItems = useQuery(api.items.listMine, ready ? {} : "skip");
  const myRequests = useQuery(api.requests.listMine, ready ? {} : "skip");
  const incomingRequests = useQuery(api.requests.listIncoming, ready ? {} : "skip");
  const isAdmin = me?.role === "admin";
  const adminLoans = useQuery(api.requests.listAllLoansAdmin, ready && isAdmin ? {} : "skip");
  const users = useQuery(api.users.listAll, ready && isAdmin ? {} : "skip");

  async function run(action: Promise<unknown>, successMessage?: string) {
    setError("");
    setNotice("");
    try {
      await action;
      if (successMessage) setNotice(successMessage);
      return true;
    } catch (reason) {
      setError(messageFrom(reason));
      return false;
    }
  }

  if (!ready) {
    return (
      <section className="card">
        <p className="muted">Setting up your profile…</p>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    );
  }

  if (me === undefined) {
    return <section className="card"><p className="muted">Loading your profile…</p></section>;
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
      <div className="tabs" role="group" aria-label="Dashboard sections">
        {tabs.map((tab) => (
          <button
            className={`tab ${activeTab === tab.key ? "active" : ""}`}
            id={`tab-${tab.key}`}
            aria-pressed={activeTab === tab.key}
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="success" role="status">{notice}</p>}

      {activeTab === "browse" && (
        <section className="tab-panel" id="panel-browse" aria-labelledby="tab-browse">
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
          </div>
          {items === undefined ? (
            <p className="muted">Loading items…</p>
          ) : visibleItems?.length === 0 ? (
            <p className="muted">No items match this category.</p>
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
                    <p className="description">{item.description}</p>
                    <p className="muted">Lent by {item.ownerName}</p>
                    {item.ownerTrusted && <span className="trusted-badge">Trusted Lender</span>}
                    {isMine ? (
                      <span className="muted">Yours</span>
                    ) : item.available ? (
                      requestingItemId === item._id ? (
                        <form
                          className="form request-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void (async () => {
                              const sent = await run(createRequest({ itemId: item._id, ...requestDates }), "Request sent.");
                              if (sent) {
                                setRequestingItemId(null);
                                setRequestDates({ startDate: "", endDate: "" });
                              }
                            })();
                          }}
                        >
                          <label>
                            Start date
                            <input
                              type="date"
                              required
                              value={requestDates.startDate}
                              onChange={(event) => setRequestDates({ ...requestDates, startDate: event.target.value })}
                            />
                          </label>
                          <label>
                            End date
                            <input
                              type="date"
                              required
                              value={requestDates.endDate}
                              onChange={(event) => setRequestDates({ ...requestDates, endDate: event.target.value })}
                            />
                          </label>
                          <div className="form-actions">
                            <button className="button button-primary" type="submit">Send request</button>
                            <button
                              className="button button-secondary"
                              type="button"
                              onClick={() => {
                                setRequestingItemId(null);
                                setRequestDates({ startDate: "", endDate: "" });
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
                            setRequestingItemId(item._id);
                          }}
                        >
                          Request
                        </button>
                      )
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === "listings" && (
        <section className="tab-panel" id="panel-listings" aria-labelledby="tab-listings">
          <div className="card form-card">
            <h2>Add an item</h2>
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  if (await run(createItem(itemForm), "Item added.")) {
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
                  rows={3}
                  value={itemForm.description}
                  onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })}
                />
              </label>
              <button className="button button-primary" type="submit">Add item</button>
            </form>
          </div>
          {myItems === undefined ? (
            <p className="muted">Loading your listings…</p>
          ) : myItems.length === 0 ? (
            <p className="muted">You haven&apos;t listed an item yet.</p>
          ) : (
            <div className="grid">
              {myItems.map((item) => (
                <article className="card item-card" key={item._id}>
                  <h2>{item.name}</h2>
                  <div className="badge-row">
                    <span className="badge">{categoryLabel(item.category)}</span>
                    <StatusBadge status={item.available ? "available" : "borrowed"} />
                  </div>
                  <p className="description">{item.description}</p>
                  <button
                    className="button button-danger"
                    type="button"
                    onClick={() => window.confirm(`Delete “${item.name}”?`) && void run(removeItem({ itemId: item._id }), "Listing deleted.")}
                  >
                    Delete
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === "my-requests" && (
        <section className="tab-panel" id="panel-my-requests" aria-labelledby="tab-my-requests">
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
                      <button className="button button-secondary" type="button" onClick={() => void run(cancelRequest({ requestId: request._id }), "Request cancelled.")}>
                        Cancel
                      </button>
                    )}
                    {request.status === "approved" && (
                      <button className="button button-primary" type="button" onClick={() => void run(markReturned({ requestId: request._id }), "Item marked returned.")}>
                        Mark returned
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
        <section className="tab-panel" id="panel-incoming" aria-labelledby="tab-incoming">
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
                        <button className="button button-primary" type="button" onClick={() => void run(approveRequest({ requestId: request._id }), "Request approved.")}>
                          Approve
                        </button>
                        <button className="button button-secondary" type="button" onClick={() => void run(declineRequest({ requestId: request._id }), "Request declined.")}>
                          Decline
                        </button>
                      </>
                    )}
                    {request.status === "approved" && (
                      <button className="button button-primary" type="button" onClick={() => void run(markReturned({ requestId: request._id }), "Item marked returned.")}>
                        Mark returned
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
        <section className="tab-panel admin-panel" id="panel-admin" aria-labelledby="tab-admin">
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
                            onClick={() => void run(setTrustedLender({ userId: user._id, trusted: !user.trustedLender }), user.trustedLender ? "Trust removed." : "Lender marked trusted.")}
                          >
                            {user.trustedLender ? "Remove trust" : "Mark trusted"}
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
                      onClick={() => window.confirm(`Delete “${item.name}”?`) && void run(removeItem({ itemId: item._id }), "Listing deleted.")}
                    >
                      Delete
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
