import type { Metadata } from "next";
import Link from "next/link";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "LendLoop — Borrow what you need. Lend what you don't.",
  description: "Borrow what you need. Lend what you don't.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <ConvexClientProvider>
            <header className="site-header">
              <div className="container header-content">
                <Link className="brand" href="/">
                  <span className="brand-name">LendLoop</span>
                  <span className="tagline">Borrow what you need. Lend what you don't.</span>
                </Link>
                <nav className="nav-links" aria-label="Main navigation">
                  <Link href="/">Home</Link>
                  <Link href="/dashboard">Dashboard</Link>
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button className="button button-primary" type="button">
                        Sign in to lend or borrow
                      </button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <UserButton />
                  </SignedIn>
                </nav>
              </div>
            </header>
            <main className="container page-content">{children}</main>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
