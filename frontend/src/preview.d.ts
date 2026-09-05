/**
 * Build-time preview constant, set by angular.json `define`: `false` in the default
 * options (production), `true` only in the `mockup` configuration the preview publisher
 * selects. esbuild folds it, so every `if (COLOSSUS_PREVIEW)` branch is dead-code-eliminated
 * from production bundles — put preview-only affordances behind it, never behind a runtime
 * or environment-file flag (an object property is not folded).
 */
declare const COLOSSUS_PREVIEW: boolean;
