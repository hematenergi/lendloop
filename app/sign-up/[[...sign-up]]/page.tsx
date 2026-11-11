import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <section className="auth-page" style={{ flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div style={{ textAlign: "center" }}>
        <div className="brand-name">LendLoop</div>
        <p className="caption" style={{ margin: 0 }}>Borrow what you need. Lend what you don&apos;t.</p>
      </div>
      <Suspense fallback={null}>
        <SignUp />
      </Suspense>
    </section>
  );
}
