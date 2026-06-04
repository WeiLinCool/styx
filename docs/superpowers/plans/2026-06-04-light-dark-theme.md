# Light / Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared light/dark/system theme system with manual switching for both public and admin surfaces, while softening the light palette away from stark white.

**Architecture:** Wire `next-themes` at the root as the single theme source of truth, then move global colors and key public/admin shell surfaces onto semantic tokens. Add one shared client theme toggle component and place it in both the public navbar and admin header/shell so the same persisted theme state controls the entire app.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS v4, `next-themes`, shadcn/Radix UI, Sonner

---

## File Structure

- Create: `src/components/theme/theme-provider.tsx`
  - Client wrapper around `next-themes` provider.
- Create: `src/components/theme/theme-toggle.tsx`
  - Shared light/dark/system switcher for public and admin surfaces.
- Modify: `src/app/layout.tsx`
  - Mount the global theme provider around app content and toaster.
- Modify: `src/app/globals.css`
  - Update global semantic color tokens, body colors, and scrollbar colors for both themes.
- Modify: `src/features/admin/admin-header.tsx`
  - Add theme toggle placement and move header colors to semantic tokens.
- Modify: `src/features/admin/admin-shell.tsx`
  - Replace hard-coded neutral colors with semantic token classes.
- Modify: `src/features/public/home-page.tsx`
  - Add public navbar toggle and convert key navbar/menu/hero colors to theme-aware tokens.
- Test/verify: `pnpm validate`, `pnpm build`, browser check on public home and admin console.

### Task 1: Add global theme provider

**Files:**
- Create: `src/components/theme/theme-provider.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create the client theme provider wrapper**

```tsx
'use client';

import type { ReactNode } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 2: Wrap the root layout body content with the theme provider**

```tsx
import { ThemeProvider } from '@/components/theme/theme-provider';

<body className="antialiased">
  <ThemeProvider>
    <AuthProvider>{children}</AuthProvider>
    <Toaster />
  </ThemeProvider>
</body>
```

- [ ] **Step 3: Verify the app still type-checks with the new provider**

Run: `pnpm ts-check`
Expected: PASS without new type errors from `src/app/layout.tsx` or `src/components/theme/theme-provider.tsx`

### Task 2: Rebuild global semantic theme tokens

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace light theme tokens with a softer gray-white palette**

```css
:root {
  --radius: 0.75rem;
  --background: #f3f4f6;
  --foreground: #18181b;
  --card: #fcfcfd;
  --card-foreground: #18181b;
  --popover: #fcfcfd;
  --popover-foreground: #18181b;
  --primary: #18181b;
  --primary-foreground: #fafafa;
  --secondary: #eceef2;
  --secondary-foreground: #18181b;
  --muted: #e8ebf0;
  --muted-foreground: #6b7280;
  --accent: #2563eb;
  --accent-foreground: #ffffff;
  --destructive: #dc2626;
  --border: rgba(24, 24, 27, 0.1);
  --input: rgba(24, 24, 27, 0.08);
  --ring: #2563eb;
  --chart-1: #2563eb;
  --chart-2: #16a34a;
  --chart-3: #d97706;
  --chart-4: #7c3aed;
  --chart-5: #db2777;
  --sidebar: #eef1f5;
  --sidebar-foreground: #18181b;
  --sidebar-primary: #18181b;
  --sidebar-primary-foreground: #fafafa;
  --sidebar-accent: #e3e7ee;
  --sidebar-accent-foreground: #18181b;
  --sidebar-border: rgba(24, 24, 27, 0.08);
  --sidebar-ring: #2563eb;
}
```

- [ ] **Step 2: Replace dark theme tokens with layered deep-gray surfaces**

```css
.dark {
  --background: #0f1115;
  --foreground: #f3f4f6;
  --card: #171a20;
  --card-foreground: #f3f4f6;
  --popover: #171a20;
  --popover-foreground: #f3f4f6;
  --primary: #f3f4f6;
  --primary-foreground: #0f1115;
  --secondary: #1d2128;
  --secondary-foreground: #f3f4f6;
  --muted: #20252d;
  --muted-foreground: #9ca3af;
  --accent: #60a5fa;
  --accent-foreground: #08111f;
  --destructive: #f87171;
  --border: rgba(255, 255, 255, 0.1);
  --input: rgba(255, 255, 255, 0.12);
  --ring: #60a5fa;
  --chart-1: #60a5fa;
  --chart-2: #4ade80;
  --chart-3: #f59e0b;
  --chart-4: #a78bfa;
  --chart-5: #f472b6;
  --sidebar: #11141a;
  --sidebar-foreground: #f3f4f6;
  --sidebar-primary: #f3f4f6;
  --sidebar-primary-foreground: #0f1115;
  --sidebar-accent: #1b2028;
  --sidebar-accent-foreground: #f3f4f6;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-ring: #60a5fa;
}
```

- [ ] **Step 3: Move body and scrollbar styling onto semantic tokens**

```css
* {
  scrollbar-width: thin;
  scrollbar-color: var(--muted-foreground) transparent;
}

*::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--foreground) 14%, transparent);
  border-radius: 3px;
}

body {
  background: var(--background);
  color: var(--foreground);
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 4: Verify CSS/token changes compile**

Run: `pnpm build`
Expected: PASS without CSS parsing errors from `src/app/globals.css`

### Task 3: Add the shared theme toggle component

**Files:**
- Create: `src/components/theme/theme-toggle.tsx`

- [ ] **Step 1: Create a mounted-safe theme toggle using `next-themes`**

```tsx
'use client';

import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '夜间', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
] as const;

type ThemeToggleProps = {
  className?: string;
  variant?: 'ghost' | 'outline';
};

export function ThemeToggle({ className, variant = 'outline' }: ThemeToggleProps) {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[2];
  const CurrentIcon = current.icon;

  if (!mounted) {
    return (
      <Button
        type="button"
        variant={variant}
        size="icon"
        className={cn('shrink-0', className)}
        aria-label="主题切换"
      >
        <Monitor className="size-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="icon"
          className={cn('shrink-0', className)}
          aria-label="主题切换"
        >
          <CurrentIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = option.value === theme;

          return (
            <DropdownMenuItem
              key={option.value}
              className="flex items-center justify-between"
              onClick={() => setTheme(option.value)}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4" />
                {option.label}
              </span>
              {active ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Verify the toggle component type-checks**

Run: `pnpm ts-check`
Expected: PASS without prop or union errors in `src/components/theme/theme-toggle.tsx`

### Task 4: Wire the toggle into the admin shell and convert admin shell colors

**Files:**
- Modify: `src/features/admin/admin-header.tsx`
- Modify: `src/features/admin/admin-shell.tsx`

- [ ] **Step 1: Import and place the theme toggle in the admin header controls**

```tsx
import { ThemeToggle } from '@/components/theme/theme-toggle';

<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
  <ThemeToggle className="h-8 w-8 border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground" />
  ...
</div>
```

- [ ] **Step 2: Replace admin header hard-coded neutrals with semantic color classes**

```tsx
<header className="flex min-h-16 flex-col gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:flex-row md:items-center md:justify-between md:px-6">
  <div className="min-w-0">
    <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <LockKeyhole className="h-3.5 w-3.5" />
      后台控制台
    </div>
    <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">运营仪表盘</h1>
  </div>
</header>
```

- [ ] **Step 3: Replace admin shell root/sidebar colors with semantic token classes**

```tsx
<div className="min-h-screen bg-background text-foreground">
  <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
    <aside className="border-b border-sidebar-border bg-sidebar px-4 py-4 text-sidebar-foreground lg:border-r lg:border-b-0">
      <div className="mb-5 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-xs font-black text-sidebar-primary-foreground">
          NF
        </div>
```

- [ ] **Step 4: Verify admin code compiles**

Run: `pnpm ts-check`
Expected: PASS without JSX/className errors in `admin-header.tsx` and `admin-shell.tsx`

### Task 5: Wire the toggle into the public home page and make key public surfaces theme-aware

**Files:**
- Modify: `src/features/public/home-page.tsx`

- [ ] **Step 1: Import the shared theme toggle into the public home page**

```tsx
import { ThemeToggle } from '@/components/theme/theme-toggle';
```

- [ ] **Step 2: Add the toggle to desktop and mobile navbar controls**

```tsx
<div className="hidden items-center gap-3 lg:flex">
  <ThemeToggle className="h-9 w-9 rounded-full border-border bg-background/80 text-foreground shadow-sm backdrop-blur-xl hover:bg-accent hover:text-accent-foreground" />
  ...
</div>

<div className="mt-2 flex items-center justify-between px-3">
  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">主题</span>
  <ThemeToggle className="h-9 w-9 rounded-full border-border bg-background/80 text-foreground" />
</div>
```

- [ ] **Step 3: Convert navbar/menu/dropdown/hero hard-coded colors to semantic theme classes**

```tsx
<div className={`mx-auto flex h-12 max-w-5xl items-center justify-between rounded-2xl border px-5 transition-all duration-500 ${
  scrolled
    ? 'border-border bg-background/80 shadow-lg shadow-black/5 backdrop-blur-2xl'
    : 'border-border/80 bg-background/65 shadow-md shadow-black/3 backdrop-blur-2xl'
}`}>

<span className="text-sm font-semibold tracking-tight text-foreground">南风石印工坊</span>

<DropdownMenuContent align="start" className="w-48 rounded-xl border-border bg-popover/95 p-1.5 shadow-xl backdrop-blur-2xl">

<h1 className="mb-6 text-6xl font-black tracking-tight text-foreground sm:text-7xl lg:text-8xl">

<p className="mx-auto mb-10 max-w-xl text-base text-muted-foreground">
```

- [ ] **Step 4: Verify the public page code compiles**

Run: `pnpm ts-check`
Expected: PASS without JSX/className errors in `src/features/public/home-page.tsx`

### Task 6: Run full validation and browser verification

**Files:**
- Verify only

- [ ] **Step 1: Run repository validation**

Run: `pnpm validate`
Expected: PASS for `ts-check` and `lint:build`

- [ ] **Step 2: Run production build**

Run: `pnpm build`
Expected: PASS with successful Next.js production build

- [ ] **Step 3: Run local app for browser verification**

Run: `pnpm dev`
Expected: Local app starts successfully on the default Next.js port

- [ ] **Step 4: Verify public home theme behavior in browser**

Check:
- `/home` shows softened light palette instead of stark white
- Toggle switches between `浅色` / `夜间` / `跟随系统`
- Refresh preserves the selected explicit theme
- Mobile menu and dropdown panels stay theme-consistent

Expected: PASS with no bright light-only islands on the homepage shell

- [ ] **Step 5: Verify admin theme behavior in browser**

Check:
- `/admin/...` shell updates across background, sidebar, header, and controls
- Admin badges/controls remain readable in dark mode
- Selecting `跟随系统` responds correctly when browser/system theme changes

Expected: PASS with readable admin shell contrast in both themes
