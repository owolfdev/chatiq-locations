"use client";

import { useState, type CSSProperties, type FormEvent } from "react";

export function LoginForm(props: { next: string; configured: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!props.configured) return;
    setPending(true);
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
        setPending(false);
        return;
      }
      window.location.assign(props.next || "/");
    } catch {
      setError("Sign-in failed");
      setPending(false);
    }
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
          <button type="submit" disabled={pending} style={button}>
            {pending ? "Signing in…" : "Sign in"}
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
