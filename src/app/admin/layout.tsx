import { Schibsted_Grotesk } from "next/font/google";
import "@fontsource-variable/source-serif-4/opsz.css";
import "../globals.css";

const sans = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-schibsted" });

/** Internal staff pages: their own root layout, English only, outside the localized site. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
