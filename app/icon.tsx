import { ImageResponse } from "next/og";
import { GiShoppingBag } from "react-icons/gi";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Same mark used on the login page (app/login/page.tsx) — react-icons
// components render as plain <svg>/<path>, which satori (next/og's
// renderer) supports directly.
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
        <GiShoppingBag size={18} color="#ffffff" />
      </div>
    ),
    { ...size },
  );
}
