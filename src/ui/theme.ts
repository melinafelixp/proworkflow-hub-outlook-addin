import {
  createLightTheme,
  makeStyles,
  mergeClasses,
  shorthands,
  type BrandVariants,
  type ButtonState,
  type DialogTitleState,
  type FluentProviderCustomStyleHooks,
  type Theme,
} from "@fluentui/react-components";

/**
 * Brand styling for ProWorkflow Hub. This file is the whole styling layer on top of Fluent UI:
 * colors, fonts and a few component finishes. It holds no behavior.
 *
 * The interface is light only, by design.
 */
export const BRAND = {
  /** Headings, primary buttons, checked controls, focus rings. */
  primary: "#003c46",
  primaryHover: "#00515e",
  primaryPressed: "#002a31",
  /** Interactive states and accents: hover borders, selected tints, unread markers. */
  secondary: "#00afaf",
  /**
   * The secondary color darkened for text. #00afaf on white is 2.7:1, below the 4.5:1 needed for
   * readable text, so links and small teal labels use this shade (5.1:1) instead.
   */
  secondaryText: "#007c7c",
  secondaryTint: "#e5f6f6",
  secondaryTintStrong: "#d4efef",
  hoverTint: "#f0f9f9",
  /** Body text. */
  text: "#21231f",
  textSoft: "#3a3d37",
  textMuted: "#5c5f59",
  placeholder: "#74776f",
  surface: "#ffffff",
  canvas: "#f6f8f8",
  canvasStrong: "#eef2f2",
  line: "#dfe5e5",
  lineStrong: "#c3cccc",
  lineFaint: "#ebf0f0",
} as const;

/** Questa Sans Regular for interface text, Questa Sans Bold for headings and callouts. */
export const FONT_STACK = '"Questa Sans", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';

// Fluent builds its brand tokens from a 16-step ramp. Step 80 is the main brand color.
const ramp: BrandVariants = {
  10: "#001114",
  20: "#00181c",
  30: "#002026",
  40: BRAND.primaryPressed,
  50: "#002f37",
  60: "#00353e",
  70: BRAND.primaryHover,
  80: BRAND.primary,
  90: "#00697a",
  100: "#008391",
  110: BRAND.secondary,
  120: "#33bfbf",
  130: "#66cfcf",
  140: "#a6e0e0",
  150: BRAND.secondaryTintStrong,
  160: BRAND.secondaryTint,
};

export const brandTheme: Theme = {
  ...createLightTheme(ramp),

  // Typography. Interface text is Regular; anything that should be Bold asks for fontWeightBold.
  fontFamilyBase: FONT_STACK,
  fontFamilyNumeric: FONT_STACK,
  fontWeightRegular: 400,
  fontWeightMedium: 400,
  fontWeightSemibold: 400,
  fontWeightBold: 700,

  // Text
  colorNeutralForeground1: BRAND.text,
  colorNeutralForeground1Hover: BRAND.primary,
  colorNeutralForeground1Pressed: BRAND.primaryPressed,
  colorNeutralForeground1Selected: BRAND.primary,
  colorNeutralForeground2: BRAND.textSoft,
  colorNeutralForeground2Hover: BRAND.primary,
  colorNeutralForeground2Pressed: BRAND.primaryPressed,
  colorNeutralForeground2Selected: BRAND.primary,
  colorNeutralForeground3: BRAND.textMuted,
  colorNeutralForeground3Hover: BRAND.primary,
  colorNeutralForeground4: BRAND.placeholder,
  colorBrandForegroundLink: BRAND.secondaryText,
  colorBrandForegroundLinkHover: BRAND.primary,
  colorBrandForegroundLinkPressed: BRAND.primaryPressed,
  colorBrandForegroundLinkSelected: BRAND.secondaryText,

  // Surfaces: white cards on a very light neutral, teal tints for hover and selection
  colorNeutralBackground1: BRAND.surface,
  colorNeutralBackground1Hover: BRAND.hoverTint,
  colorNeutralBackground1Pressed: BRAND.secondaryTintStrong,
  colorNeutralBackground1Selected: BRAND.secondaryTint,
  colorNeutralBackground2: BRAND.canvas,
  colorNeutralBackground2Hover: BRAND.hoverTint,
  colorNeutralBackground3: BRAND.canvasStrong,
  colorSubtleBackgroundHover: BRAND.secondaryTint,
  colorSubtleBackgroundPressed: BRAND.secondaryTintStrong,
  colorSubtleBackgroundSelected: BRAND.secondaryTint,

  // Lines. Hover picks up the secondary color; focus and pressed use the primary for contrast.
  colorNeutralStroke1: BRAND.lineStrong,
  colorNeutralStroke1Hover: BRAND.secondary,
  colorNeutralStroke1Pressed: BRAND.primary,
  colorNeutralStroke1Selected: BRAND.primary,
  colorNeutralStroke2: BRAND.line,
  colorNeutralStroke3: BRAND.lineFaint,
  colorNeutralStrokeAccessible: BRAND.textMuted,
  colorNeutralStrokeAccessibleHover: BRAND.secondaryText,
  colorNeutralStrokeAccessiblePressed: BRAND.primary,
  colorStrokeFocus2: BRAND.primary,
};

const useButtonBrand = makeStyles({
  // Secondary and outline buttons: teal outline, primary-colored label.
  outlined: {
    ...shorthands.borderColor(BRAND.secondary),
    color: BRAND.primary,
    ":hover": {
      ...shorthands.borderColor(BRAND.primary),
      backgroundColor: BRAND.secondaryTint,
      color: BRAND.primary,
    },
    ":hover:active": {
      ...shorthands.borderColor(BRAND.primary),
      backgroundColor: BRAND.secondaryTintStrong,
      color: BRAND.primaryPressed,
    },
  },
});

const useDialogTitleBrand = makeStyles({
  title: { fontWeight: 700, color: BRAND.primary },
});

/**
 * Per-component finishes that theme tokens cannot express. Passed to FluentProvider; each hook only
 * adds class names, so component behavior is untouched.
 */
export const brandStyleHooks: FluentProviderCustomStyleHooks = {
  useButtonStyles_unstable: (state) => {
    const s = useButtonBrand();
    const button = state as ButtonState;
    const outlined = button.appearance === "secondary" || button.appearance === "outline";
    if (outlined && !button.disabled && !button.disabledFocusable) {
      button.root.className = mergeClasses(button.root.className, s.outlined);
    }
  },
  useDialogTitleStyles_unstable: (state) => {
    const s = useDialogTitleBrand();
    const title = state as DialogTitleState;
    title.root.className = mergeClasses(title.root.className, s.title);
  },
};
