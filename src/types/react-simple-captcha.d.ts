declare module 'react-simple-captcha' {
  import type { ComponentType } from 'react';

  export function loadCaptchaEnginge(
    numberOfCharacters: number,
    backgroundColor?: string,
    fontColor?: string,
    charMap?: 'upper' | 'lower' | 'numbers' | 'special_char' | '',
  ): void;

  export function validateCaptcha(userValue: string, reload?: boolean): boolean;

  export const LoadCanvasTemplate: ComponentType<{
    reloadText?: string;
    reloadColor?: string;
  }>;

  export const LoadCanvasTemplateNoReload: ComponentType;
}
