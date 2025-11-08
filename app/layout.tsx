import "./globals.css";

export const metadata = {
  title: "Token Metrics Indices Dashboard",
  description:
    "Live view of Token Metrics indices with 30-day performance insights and server-backed data",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-night-950">
      <body className="min-h-screen bg-gradient-to-br from-night-950 via-night-900 to-night-800">
        {children}
      </body>
    </html>
  );
}
