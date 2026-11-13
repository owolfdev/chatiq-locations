"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { MapperStatus } from "@/components/mapper-status";

export function LoginForm(props: { next: string; configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "signin" | "next">("idle");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!props.configured || phase !== "idle") return;
    setPhase("signin");
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "Sign-in failed");
        setPhase("idle");
        return;
      }
      setPhase("next");
      router.push(props.next || "/");
    } catch {
      setError("Sign-in failed");
      setPhase("idle");
    }
  }

  if (phase !== "idle") {
    const openingStore = props.next.startsWith("/map");
    return (
      <MapperStatus
        title={phase === "signin" ? "Sign in" : openingStore ? "Store mapper" : "Your stores"}
        detail={
          phase === "signin"
            ? "Signing in…"
            : openingStore
              ? "Opening store…"
              : "Opening your stores…"
        }
      />
    );
  }

  return (
    <main style={shell}>
      <p style={eyebrow}>Store mapper</p>
      <h1 style={{ margin: "0 0 8px", fontSize: "1.75rem" }}>Sign in</h1>
      <p style={{ margin: "0 0 20px", color: "#555", lineHeight: 1.45 }}>
        Use your ChatIQ email and password. This opens your team’s stores.
      </p>
      {props.configured ? (
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={label}>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={input}
            />
          </label>
          <label style={label}>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={input}
            />
          </label>
          {error ? <p style={{ margin: 0, color: "#b71c1c" }}>{error}</p> : null}
          <button type="submit" style={button}>
            Sign in
          </button>
        </form>
      ) : (
        <p style={{ color: "#b71c1c" }}>
          Sign-in is not configured on this server yet.
        </p>
      )}
    </main>
  );
}

const shell: CSSProperties = {
  padding: "1.5rem",
  maxWidth: 440,
  margin: "0 auto",
};

const eyebrow: CSSProperties = {
  margin: 0,
  fontSize: 13,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#888",
};

const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 14,
};

const input: CSSProperties = {
  font: "inherit",
  fontSize: 16,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #ccc",
  background: "#fff",
};

const button: CSSProperties = {
  font: "inherit",
  fontSize: 16,
  padding: "12px 14px",
  borderRadius: 8,
  border: "none",
  background: "#111",
  color: "#fff",
};
