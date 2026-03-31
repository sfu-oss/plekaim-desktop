export const metadata = {
  title: "KaimPLE Desktop",
  description: "Pipeline Engineering Calculator",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body style={{ margin: 0, background: "#0b1020", color: "#e2e8f0" }}>
        {children}
      </body>
    </html>
  );
}
