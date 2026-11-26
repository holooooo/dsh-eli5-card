export const POPUP_MARGIN = 12;

export function clampPopupPosition({ left, top }, { width, height }, { viewportWidth, viewportHeight }) {
  const clamp = (value, limit) => Math.max(POPUP_MARGIN, Math.min(limit - POPUP_MARGIN, value));
  return { left: clamp(left, viewportWidth - width), top: clamp(top, viewportHeight - height) };
}
