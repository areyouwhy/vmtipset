import { SignIn } from "@clerk/nextjs";

export const metadata = {
  title: "LOGGA IN — Copa del Mundo 2026",
};

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <SignIn />
    </main>
  );
}
