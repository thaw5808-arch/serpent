import "@fontsource-variable/schibsted-grotesk/wght.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "../globals.css";

/** Internal staff pages: their own root layout, English only, outside the localized site. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
