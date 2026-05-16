import { SignUp } from "@clerk/nextjs";

export const metadata = {
  title: "SKAPA KONTO — Copa del Mundo 2026",
};

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <SignUp />
    </main>
  );
}
