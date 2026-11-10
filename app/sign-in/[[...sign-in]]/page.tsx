import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <section className="auth-page">
      <Suspense fallback={null}>
        <SignIn />
      </Suspense>
    </section>
  );
}
