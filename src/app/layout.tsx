import "./globals.css"

export const metadata = {
  title: "Forge AI",
  description: "AI game design generator",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
