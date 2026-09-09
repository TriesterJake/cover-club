import "./globals.css";

export const metadata = {
  title: "The Cover Club",
  description: "Family pick'em league",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
