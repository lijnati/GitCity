import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="flex h-14 items-center border-b border-line px-4">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center px-5">
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-accent">404</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em]">No city at this address</h1>
        <p className="mt-3 text-[15px] text-ink-2">City links look like <span className="font-mono">/city/owner/repository</span>.</p>
        <Link href="/" className="mt-8 inline-flex h-10 w-fit items-center rounded-sm bg-ink px-4 text-[14px] font-medium text-paper hover:bg-ink-2">
          Build a city
        </Link>
      </main>
    </div>
  );
}
