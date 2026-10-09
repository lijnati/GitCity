"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { parseRepoInput } from "@/lib/repo/parse-repo-input";
import { cn } from "@/lib/utils";

export function RepoForm({ className }: { className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const id = useId();

  return (
    <form
      className={className}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const r = parseRepoInput(value);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setError(null);
        startTransition(() => router.push(`/city/${encodeURIComponent(r.value.owner)}/${encodeURIComponent(r.value.repo)}`));
      }}
    >
      <label htmlFor={id} className="mb-2 block text-[13px] font-medium text-ink-2">
        Public GitHub repository
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-0">
        <input
          id={id}
          name="repository"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="github.com/owner/repository"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className={cn(
            "h-14 w-full min-w-0 rounded-sm sm:flex-1 border border-ink bg-surface px-4 font-mono text-[15px] text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent sm:rounded-r-none sm:border-r-0",
            error && "border-accent",
          )}
        />
        <button
          type="submit"
          disabled={pending}
          className="h-14 shrink-0 rounded-sm bg-ink px-6 text-[15px] font-medium text-paper transition-colors hover:bg-accent disabled:opacity-60 sm:rounded-l-none"
        >
          {pending ? "Opening…" : "Build my city →"}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-2 text-[13px] text-accent-ink" role="alert">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-2 text-[13px] text-muted">
          Accepts <span className="font-mono">owner/name</span> or any github.com URL. Public repositories only, no sign-in.
        </p>
      )}
    </form>
  );
}
