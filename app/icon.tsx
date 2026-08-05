import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Simplified version of the POS-terminal mark used on the login page
// (app/login/page.tsx's PosMachineIcon) — the keypad detail doesn't read at
// favicon size, so only the body + screen survive.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#4f46e5",
          borderRadius: 7,
        }}
      >
        <div
          style={{
            width: 18,
            height: 12,
            background: "#ffffff",
            borderRadius: 2.5,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
