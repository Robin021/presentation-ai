import NextAuthProvider from "@/provider/NextAuthProvider";
import TanStackQueryProvider from "@/provider/TanstackProvider";
import { ThemeProvider } from "@/provider/theme-provider";
import "@/styles/globals.css";
import { type Metadata } from "next";
import { Inter } from "next/font/google";

// If loading a variable font, you don't need to specify the font weight
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Presentation AI - Create Stunning Slides instantly",
  description: "Generate professional presentations in seconds using AI.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <TanStackQueryProvider>
      <NextAuthProvider>
        <html lang="en" suppressHydrationWarning>
          <body className={`${inter.className} antialiased`}>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              {children}
            </ThemeProvider>
          </body>
        </html>
      </NextAuthProvider>
    </TanStackQueryProvider>
  );
}
