import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <section className="auth-page">
      <Suspense fallback={null}>
        <SignUp />
      </Suspense>
    </section>
  );
}
