import "./globals.css";

export const metadata = {
  metadataBase: new URL(
    "https://ai-screenshot-reply-mizeieqo3-jeffkarthick.vercel.app"
  ),

  title: "ReplyAI — What Should I Reply?",

  description:
    "Upload a screenshot and get AI-powered reply suggestions.",

  openGraph: {
    title: "ReplyAI — What Should I Reply?",

    description:
      "Upload a screenshot and get AI-powered reply suggestions.",

    url: "https://ai-screenshot-reply-mizeieqo3-jeffkarthick.vercel.app",

    siteName: "ReplyAI",

    images: [
      {
        url: "/replyai-share.png",
        width: 1080,
        height: 1350,
        alt: "ReplyAI — AI-powered reply assistant",
      },
    ],

    locale: "en_US",

    type: "website",
  },

  twitter: {
    card: "summary_large_image",

    title:
      "ReplyAI — What Should I Reply?",

    description:
      "Upload a screenshot and get AI-powered reply suggestions.",

    images: ["/replyai-share.png"],
  },

  icons: {
    icon: "/replyai-share.png",
  },
};

export default function RootLayout({
  children,
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}