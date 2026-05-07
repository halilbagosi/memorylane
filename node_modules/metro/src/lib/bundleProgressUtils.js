"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true,
});
exports.calculateBundleProgressRatio = calculateBundleProgressRatio;
function calculateBundleProgressRatio(
  transformedFileCount,
  totalFileCount,
  previousRatio,
) {
  const baseRatio = Math.pow(
    transformedFileCount / Math.max(totalFileCount, 10),
    2,
  );
  const ratio =
    previousRatio != null ? Math.max(baseRatio, previousRatio) : baseRatio;
  return Math.min(ratio, 0.999);
}
