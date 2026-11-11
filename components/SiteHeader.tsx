"use client";

import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();

  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return null;

  return (
    <header className="site-header">
      <div className="container header-content">
        <div className="brand-block">
          <Link className="brand" href="/">
            <span className="brand-name">LendLoop</span>
            <span className="tagline">Borrow what you need. Lend what you don&apos;t.</span>
          </Link>
        </div>
        <nav className="nav-links" aria-label="Main navigation">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>Home</Link>
          <SignedIn>
            <Link href="/dashboard" aria-current={pathname === "/dashboard" ? "page" : undefined}>
              Dashboard
            </Link>
          </SignedIn>
        </nav>
        <div className="header-actions">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="button button-primary" type="button">Sign in</button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
