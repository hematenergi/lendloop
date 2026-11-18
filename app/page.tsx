"use client";

import { Show } from "@clerk/nextjs";
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
          <Show when="signed-out">
            <Link className="button button-primary" href="/sign-in">
              Sign in to lend or borrow
            </Link>
          </Show>
          <Show when="signed-in">
            <Link className="button button-primary" href="/dashboard">
              Go to dashboard
            </Link>
          </Show>
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
            <Show when="signed-out">
              <Link className="button button-primary" href="/sign-in">Sign in to lend or borrow</Link>
            </Show>
            <Show when="signed-in">
              <Link className="button button-primary" href="/dashboard">Go to dashboard</Link>
            </Show>
          </div>
        ) : (
          <div className="grid">
            {items.map((item, index) => (
              <Link className="card item-card" href="/dashboard" key={`${item.name}-${item.category}-${index}`}>
                <h3 className="clamp-2">{item.name}</h3>
                <span className="badge">{categoryLabel(item.category)}</span>
              </Link>
            ))}
          </div>
        )}
        <Show when="signed-out">
          <p className="muted catalog-note">
            <Link className="text-link" href="/sign-in">Sign in</Link> to see details, availability and to request an item.
          </p>
        </Show>
      </section>
      <footer className="landing-footer caption">
        <span className="footer-brand">LendLoop</span>
        <p>LendLoop — borrow what you need, lend what you don&apos;t.</p>
      </footer>
    </div>
  );
}
