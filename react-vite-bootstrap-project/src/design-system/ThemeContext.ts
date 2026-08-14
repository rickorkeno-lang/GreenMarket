import { createContext } from 'react';
import { colorTokensByMode, type ColorTokens, type ThemeMode } from '@/design-system/tokens/colors';
import { typeScale } from '@/design-system/tokens/typography';
import * as scales from '@/design-system/tokens/scales';

export interface ThemeContextValue {
  mode: ThemeMode;
  /** Контрастная тема (усиленный контраст текста/бордеров). Реализован как
   *  CSS-оверрайды токенов под [data-contrast='true'] (см. tokens.css), т.к.
   *  все компоненты потребляют цвета через CSS-переменные, а не через JS. */
  contrast: boolean;
  colors: ColorTokens;
  typeScale: typeof typeScale;
  spacing: typeof scales.spacing;
  radius: typeof scales.radius;
  elevation: typeof scales.elevation;
  zIndex: typeof scales.zIndex;
  motion: typeof scales.motion;
  breakpoints: typeof scales.breakpoints;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setContrast: (contrast: boolean) => void;
  toggleContrast: () => void;
}

export function buildThemeValue(
  mode: ThemeMode,
  contrast: boolean,
  setMode: (mode: ThemeMode) => void,
  toggleMode: () => void,
  setContrast: (contrast: boolean) => void,
  toggleContrast: () => void,
): ThemeContextValue {
  return {
    mode,
    contrast,
    colors: colorTokensByMode[mode],
    typeScale,
    spacing: scales.spacing,
    radius: scales.radius,
    elevation: scales.elevation,
    zIndex: scales.zIndex,
    motion: scales.motion,
    breakpoints: scales.breakpoints,
    setMode,
    toggleMode,
    setContrast,
    toggleContrast,
  };
}

export const ThemeContext = createContext<ThemeContextValue>(
  buildThemeValue('light', false, () => undefined, () => undefined, () => undefined, () => undefined),
);
