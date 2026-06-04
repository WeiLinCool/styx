import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme/theme-provider';

export const metadata: Metadata = {
  title: {
    default: '南风AI | AI视频·AI生图·多模态智能体',
    template: '%s | 南风AI',
  },
  description: '南风AI — AI视频、AI生图、多模态智能体、AI视频工作流，石头印画创意平台',
  keywords: [
    '南风AI',
    'AI视频',
    'AI生图',
    '石头印画',
    '多模态智能体',
    'AI工作流',
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
