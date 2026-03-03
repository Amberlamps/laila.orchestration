// Font configuration using next/font/google for optimized loading.
// Inter is the primary UI font; JetBrains Mono is used for code and IDs.
//
// next/font/google automatically self-hosts fonts at build time, eliminating
// external requests to Google Fonts and improving privacy and performance.
// The `variable` option creates a CSS custom property that Tailwind references
// for font-family resolution.
import { Inter, JetBrains_Mono, Roboto } from 'next/font/google';

// Inter -- primary UI font for all body text, headings, and labels.
// Load variable font with latin subset for optimal performance.
export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// JetBrains Mono -- monospace font for code blocks, IDs, and technical values.
// Used in MarkdownRenderer code blocks, entity IDs, API keys, and cost figures.
export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

// Roboto -- used exclusively for the Google Sign-In button text to comply
// with Google's Identity Branding Guidelines. Loaded with weight 500 (medium)
// which Google specifies for the sign-in button label.
export const roboto = Roboto({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-roboto',
  display: 'swap',
});
