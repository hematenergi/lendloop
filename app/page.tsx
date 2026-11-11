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
      <section className="hero">
        <p className="eyebrow">NEIGHBOURHOOD LENDING</p>
        <h1 className="display">LendLoop</h1>
        <p className="hero-tagline">Borrow what you need. Lend what you don&apos;t.</p>
        <p className="hero-description">Neighbours sharing the tools and equipment they only use once in a while.</p>
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
        <div className="catalog-heading">
          <h2 id="catalog-heading">Items from your neighbours</h2>
          {items !== undefined && <span className="caption num">{items.length} items</span>}
        </div>
        {items === undefined ? (
          <div className="grid" role="status" aria-label="Loading items">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="card item-card" key={index} aria-hidden="true">
                <div className="skeleton skel-title" />
                <div className="skeleton skel-badge" />
                <div className="skeleton skel-line" />
                <div className="skeleton skel-line" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="card empty-state">
            <h3>Nothing listed yet</h3>
            <p>Be the first to lend something — sign in and list a tool you rarely use.</p>
            <SignedOut>
              <Link className="button button-primary" href="/sign-in">Sign in to lend or borrow</Link>
            </SignedOut>
            <SignedIn>
              <Link className="button button-primary" href="/dashboard">Go to dashboard</Link>
            </SignedIn>
          </div>
        ) : (
          <div className="grid">
            {items.map((item, index) => (
              <article className="card item-card" key={`${item.name}-${item.category}-${index}`}>
                <h3 className="clamp-2">{item.name}</h3>
                <span className="badge">{categoryLabel(item.category)}</span>
              </article>
            ))}
          </div>
        )}
        <p className="muted catalog-note">
          <Link className="text-link" href="/sign-in">Sign in</Link> to see details, availability and to request an item.
        </p>
      </section>
      <footer className="landing-footer caption">
        <span className="footer-brand">LendLoop</span>
        <p>LendLoop — borrow what you need, lend what you don&apos;t.</p>
      </footer>
    </div>
  );
}
