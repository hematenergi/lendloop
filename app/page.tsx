"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { categoryLabel } from "@/lib/categories";

export default function HomePage() {
  const items = useQuery(api.items.listPublic, {});

  return (
    <div className="public-page">
      <section className="hero card">
        <h1>LendLoop</h1>
        <p className="hero-tagline">Borrow what you need. Lend what you don&apos;t.</p>
        <p>Neighbours sharing the tools and equipment they only use once in a while.</p>
        <div className="hero-actions">
          <SignedOut>
            <Link className="button button-primary" href="/sign-in">
              Sign in to lend or borrow
            </Link>
          </SignedOut>
          <SignedIn>
            <Link className="button button-primary" href="/dashboard">
              Go to dashboard
            </Link>
          </SignedIn>
        </div>
      </section>

      <section className="catalog-section" aria-labelledby="catalog-heading">
        <h2 id="catalog-heading">Items from your neighbours</h2>
        {items === undefined ? (
          <p className="muted">Loading items…</p>
        ) : items.length === 0 ? (
          <p className="muted">No items are listed yet.</p>
        ) : (
          <div className="grid">
            {items.map((item, index) => (
              <article className="card item-card" key={`${item.name}-${item.category}-${index}`}>
                <h3>{item.name}</h3>
                <span className="badge">{categoryLabel(item.category)}</span>
              </article>
            ))}
          </div>
        )}
        <p className="muted catalog-note">
          Sign in to see details, availability and to request an item.
        </p>
      </section>
    </div>
  );
}
