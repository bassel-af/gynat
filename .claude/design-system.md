# Gynat Design System

This document defines the design tokens and visual language for the Gynat family tree application.

## Color Palette

### Primary Colors (Blue)
| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary-light` | `#63b3ed` | Highlights, selected states, stat values |
| `--color-primary` | `#4a90d9` | Buttons, links, male indicator |
| `--color-primary-dark` | `#357abd` | Button gradients, hover states |

### Secondary Colors (Pink/Female)
| Token | Value | Usage |
|-------|-------|-------|
| `--color-secondary-light` | `#f2a7cf` | Deceased female indicator |
| `--color-secondary` | `#ed64a6` | Female indicator, active states |
| `--color-secondary-dark` | `#e91e8c` | Female border, spouse connector |

### Accent Colors (Orange)
| Token | Value | Usage |
|-------|-------|-------|
| `--color-accent-light` | `#fff8e6` | Search match background |
| `--color-accent` | `#f6ad55` | Active person indicator |
| `--color-accent-dark` | `#f5a623` | Search highlight, focus rings |

### Neutral Colors - Dark (Sidebar)
| Token | Value | Usage |
|-------|-------|-------|
| `--color-dark-900` | `#1a1f36` | Sidebar gradient start |
| `--color-dark-800` | `#252b48` | Sidebar gradient end |
| `--color-dark-700` | `#2d3352` | Dropdown backgrounds |

### Neutral Colors - Light
| Token | Value | Usage |
|-------|-------|-------|
| `--color-light-100` | `#f8f9fa` | App background |
| `--color-light-200` | `#f5f5f5` | Hover states |
| `--color-light-300` | `#f0f0f0` | Deceased person background |
| `--color-light-400` | `#eee` | Subtle borders |
| `--color-light-500` | `#ddd` | Standard borders |
| `--color-light-600` | `#ccc` | Edge strokes |

### Text Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--color-text-primary` | `#333` | Main text on light backgrounds |
| `--color-text-secondary` | `#666` | Secondary text, stats |
| `--color-text-muted` | `#888` | Muted text, deceased names |
| `--color-text-disabled` | `#999` | Disabled text |
| `--color-text-inverse` | `#fff` | Text on dark backgrounds |

### Semantic Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--color-error` | `#e53e3e` | Error messages |
| `--color-male` | `#4a90d9` | Male indicator |
| `--color-male-light` | `#9ec5e8` | Deceased male indicator |
| `--color-female` | `#e91e8c` | Female indicator |
| `--color-female-light` | `#f2a7cf` | Deceased female indicator |

### Alpha Colors (for overlays and subtle effects)
```css
--alpha-white-04: rgba(255, 255, 255, 0.04);
--alpha-white-06: rgba(255, 255, 255, 0.06);
--alpha-white-08: rgba(255, 255, 255, 0.08);
--alpha-white-10: rgba(255, 255, 255, 0.10);
--alpha-white-12: rgba(255, 255, 255, 0.12);
--alpha-white-15: rgba(255, 255, 255, 0.15);
--alpha-white-25: rgba(255, 255, 255, 0.25);
--alpha-white-40: rgba(255, 255, 255, 0.40);
--alpha-white-50: rgba(255, 255, 255, 0.50);
--alpha-white-60: rgba(255, 255, 255, 0.60);
--alpha-white-70: rgba(255, 255, 255, 0.70);
--alpha-black-10: rgba(0, 0, 0, 0.10);
--alpha-black-15: rgba(0, 0, 0, 0.15);
--alpha-black-25: rgba(0, 0, 0, 0.25);
--alpha-black-30: rgba(0, 0, 0, 0.30);
--alpha-black-60: rgba(0, 0, 0, 0.60);
```

## Typography

### Font Family
```css
--font-family-base: var(--font-noto-sans-arabic), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

### Font Sizes
| Token | Value | Usage |
|-------|-------|-------|
| `--font-size-xs` | `11px` | Hints, small labels |
| `--font-size-sm` | `12px` | Labels, dates, captions |
| `--font-size-md` | `13px` | Small buttons, secondary text |
| `--font-size-base` | `14px` | Body text, inputs |
| `--font-size-lg` | `15px` | Settings input, toggle text |
| `--font-size-xl` | `16px` | Search inputs, primary actions |
| `--font-size-2xl` | `18px` | Mobile headers |
| `--font-size-3xl` | `20px` | Tablet headers |
| `--font-size-4xl` | `22px` | Desktop headers |
| `--font-size-5xl` | `24px` | Stat values (mobile) |
| `--font-size-6xl` | `28px` | Stat values (desktop) |

### Font Weights
| Token | Value | Usage |
|-------|-------|-------|
| `--font-weight-normal` | `400` | Body text |
| `--font-weight-medium` | `500` | Labels, buttons |
| `--font-weight-semibold` | `600` | Names, headings |
| `--font-weight-bold` | `700` | Stats, emphasis |

### Line Heights
| Token | Value |
|-------|-------|
| `--line-height-tight` | `1` |
| `--line-height-snug` | `1.3` |
| `--line-height-normal` | `1.4` |

### Letter Spacing
| Token | Value | Usage |
|-------|-------|-------|
| `--letter-spacing-tight` | `-0.3px` | Headings |
| `--letter-spacing-wide` | `0.5px` | Uppercase labels |

## Spacing Scale

| Token | Value |
|-------|-------|
| `--space-1` | `4px` |
| `--space-2` | `6px` |
| `--space-3` | `8px` |
| `--space-4` | `10px` |
| `--space-5` | `12px` |
| `--space-6` | `14px` |
| `--space-7` | `16px` |
| `--space-8` | `18px` |
| `--space-9` | `20px` |
| `--space-10` | `22px` |
| `--space-11` | `24px` |
| `--space-12` | `28px` |
| `--space-13` | `32px` |
| `--space-14` | `40px` |
| `--space-15` | `48px` |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `3px` | Scrollbar thumb |
| `--radius-md` | `6px` | Buttons, dropdown items |
| `--radius-lg` | `8px` | Inputs, cards |
| `--radius-xl` | `10px` | Mobile buttons, close buttons |
| `--radius-2xl` | `12px` | Sections, stat items, search |
| `--radius-full` | `20px` | Chips, pills |

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 2px 4px rgba(0, 0, 0, 0.1)` | Cards |
| `--shadow-md` | `0 4px 8px rgba(0, 0, 0, 0.1)` | Dropdowns |
| `--shadow-lg` | `0 8px 24px rgba(0, 0, 0, 0.3)` | Modal dropdowns |
| `--shadow-xl` | `0 4px 20px rgba(0, 0, 0, 0.25)` | Toggle button |
| `--shadow-sidebar` | `-4px 0 24px rgba(0, 0, 0, 0.15)` | Desktop sidebar |
| `--shadow-sidebar-mobile` | `-8px 0 40px rgba(0, 0, 0, 0.4)` | Mobile sidebar |
| `--shadow-focus-primary` | `0 0 0 3px rgba(99, 179, 237, 0.15)` | Primary focus ring |
| `--shadow-focus-accent` | `0 0 0 3px rgba(246, 173, 85, 0.15)` | Accent focus ring |
| `--shadow-button` | `0 2px 8px rgba(74, 144, 217, 0.35)` | Active button glow |

## Transitions

| Token | Value | Usage |
|-------|-------|-------|
| `--transition-fast` | `0.15s ease` | Hover states |
| `--transition-base` | `0.2s ease` | Standard interactions |
| `--transition-medium` | `0.25s cubic-bezier(0.4, 0, 0.2, 1)` | Smooth transforms |
| `--transition-slow` | `0.3s cubic-bezier(0.4, 0, 0.2, 1)` | Larger animations |
| `--transition-drawer` | `0.4s cubic-bezier(0.4, 0, 0.2, 1)` | Sidebar slide |

## Responsive Breakpoints

| Token | Value | Description |
|-------|-------|-------------|
| `--breakpoint-sm` | `480px` | Small mobile phones |
| `--breakpoint-md` | `768px` | Tablets and large phones |

### Breakpoint Usage
```css
/* Tablet and below */
@media (max-width: 768px) { }

/* Small mobile */
@media (max-width: 480px) { }
```

## Layout Constants

| Token | Value | Usage |
|-------|-------|-------|
| `--sidebar-width` | `320px` | Desktop sidebar width |
| `--sidebar-width-mobile` | `min(320px, 85vw)` | Mobile sidebar width |
| `--sidebar-width-small` | `100vw` | Small mobile full width |

## Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--z-dropdown` | `100` | Dropdown menus |
| `--z-sidebar-dropdown` | `200` | Sidebar dropdowns |
| `--z-overlay` | `900` | Mobile overlay |
| `--z-sidebar` | `1000` | Mobile sidebar |
| `--z-toggle` | `1100` | Mobile toggle button |

## Gradients

### Primary Gradient
```css
--gradient-primary: linear-gradient(135deg, #4a90d9 0%, #357abd 100%);
```

### Sidebar Gradient
```css
--gradient-sidebar: linear-gradient(180deg, #1a1f36 0%, #252b48 100%);
```

### Toggle Button Gradient
```css
--gradient-toggle: linear-gradient(135deg, #1a1f36 0%, #252b48 100%);
--gradient-toggle-bar: linear-gradient(90deg, #63b3ed 0%, #4a90d9 100%);
```

### Stat Value Gradient
```css
--gradient-stat: linear-gradient(135deg, #63b3ed 0%, #4a90d9 100%);
```

### Search Hero Gradient
```css
--gradient-search-hero: linear-gradient(135deg, rgba(99, 179, 237, 0.1) 0%, rgba(66, 153, 225, 0.06) 100%);
```

## Component-Specific Tokens

### Person Card
| Token | Value |
|-------|-------|
| `--person-card-min-width` | `140px` |
| `--person-card-max-width` | `180px` |
| `--person-card-border-top-width` | `4px` |

### Spouse Connector
| Token | Value |
|-------|-------|
| `--spouse-connector-width` | `20px` |
| `--spouse-connector-height` | `2px` |

### Scrollbar
| Token | Value |
|-------|-------|
| `--scrollbar-width` | `6px` |

## Usage Guidelines

### Gender-Based Coloring
- **Male**: Use `--color-primary` (#4a90d9) for borders/indicators
- **Female**: Use `--color-secondary-dark` (#e91e8c) for borders/indicators
- **Deceased Male**: Use `--color-male-light` (#9ec5e8) with reduced opacity
- **Deceased Female**: Use `--color-female-light` (#f2a7cf) with reduced opacity

### State Styling
- **Hover**: Increase background opacity, lighten colors
- **Active/Selected**: Use accent color (#f6ad55) or primary blue border
- **Focus**: Add focus ring shadow with primary or accent color
- **Disabled/Deceased**: Reduce opacity to 0.6-0.75, use muted colors

### RTL Support
The app uses `direction: rtl` by default. Key considerations:
- Use `right` instead of `left` for positioning
- Border indicators appear on the right side
- Flex containers use `row-reverse` where needed
