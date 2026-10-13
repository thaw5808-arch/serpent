import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the bold "Slit eye" mark, full-bleed (iOS rounds the corners itself). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={180} height={180}>
        <rect width="32" height="32" fill="#17201B" />
        <path d="M3 16C8 8.5 24 8.5 29 16C24 23.5 8 23.5 3 16Z" fill="#C2A94B" />
        <ellipse cx="16" cy="16" rx="2.6" ry="6.4" fill="#17201B" />
      </svg>
    ),
    size,
  );
}
