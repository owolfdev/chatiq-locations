import type { CSSProperties } from "react";

export function MapperStatus(props: { title: string; detail: string }) {
  return (
    <main style={shell}>
      <p style={eyebrow}>Store mapper</p>
      <h1 style={title}>{props.title}</h1>
      <p className="mapper-pulse" role="status" aria-live="polite" style={detail}>
        {props.detail}
      </p>
    </main>
  );
}

const shell: CSSProperties = {
  padding: "1.5rem",
  maxWidth: 480,
  margin: "0 auto",
};

const eyebrow: CSSProperties = {
  margin: 0,
  fontSize: 13,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#888",
};

const title: CSSProperties = {
  margin: "4px 0 8px",
  fontSize: "1.75rem",
};

const detail: CSSProperties = {
  margin: 0,
  color: "#333",
  fontSize: 17,
  lineHeight: 1.45,
};
