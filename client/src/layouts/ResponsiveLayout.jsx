import { useEffect, useMemo, useState } from 'react';

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function interpolate(value, stops) {
  if (value <= stops[0][0]) return stops[0][1];

  for (let index = 1; index < stops.length; index += 1) {
    const [stopValue, stopScale] = stops[index];
    const [previousValue, previousScale] = stops[index - 1];

    if (value <= stopValue) {
      const progress = (value - previousValue) / (stopValue - previousValue);
      return previousScale + progress * (stopScale - previousScale);
    }
  }

  return stops[stops.length - 1][1];
}

function getViewport() {
  if (typeof window === 'undefined') {
    return { width: BASE_WIDTH, height: BASE_HEIGHT };
  }

  return {
    width: window.innerWidth || BASE_WIDTH,
    height: window.innerHeight || BASE_HEIGHT
  };
}

function getAdaptiveMetrics(width, height) {
  const widthScale = interpolate(width, [
    [1280, 0.89],
    [1366, 0.9],
    [1600, 0.95],
    [BASE_WIDTH, 1]
  ]);
  const heightScale = interpolate(height, [
    [720, 0.85],
    [768, 0.9],
    [900, 0.95],
    [BASE_HEIGHT, 1]
  ]);
  const uiScale = Number(clamp(Math.min(widthScale, heightScale), 0.85, 1).toFixed(3));
  const densityScale = Number(clamp(0.88 + (uiScale - 0.85) * 0.8, 0.88, 1).toFixed(3));
  const fontSize = width <= 1280 || height <= 720 ? 14 : uiScale < 0.95 ? 15 : 16;
  const sidebarWidth = uiScale >= 0.99 ? 240 : Math.round(clamp(240 * uiScale * 0.94, 180, 240));

  return {
    width,
    height,
    uiScale: Number(uiScale.toFixed(3)),
    densityScale: Number(densityScale.toFixed(3)),
    fontSize,
    sidebarWidth,
    compact: width <= 1366 || height <= 800
  };
}

export function ResponsiveLayout({ children }) {
  const [viewport, setViewport] = useState(getViewport);
  const metrics = useMemo(() => getAdaptiveMetrics(viewport.width, viewport.height), [viewport]);

  useEffect(() => {
    const handleResize = () => {
      setViewport(getViewport());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const style = {
    '--app-width': `${metrics.width}px`,
    '--app-height': `${metrics.height}px`,
    '--ui-scale': metrics.uiScale,
    '--density-scale': metrics.densityScale,
    '--app-font-size': `${metrics.fontSize}px`,
    '--sidebar-width': `${metrics.sidebarWidth}px`,
    '--header-height': `${Math.round(64 * metrics.densityScale)}px`,
    '--page-padding': `${Math.round(24 * metrics.densityScale)}px`,
    '--panel-padding': `${Math.round(20 * metrics.densityScale)}px`,
    '--control-y': `${Math.round(8 * metrics.densityScale)}px`,
    '--control-x': `${Math.round(12 * metrics.densityScale)}px`,
    '--button-y': `${Math.round(8 * metrics.densityScale)}px`,
    '--button-x': `${Math.round(16 * metrics.densityScale)}px`,
    '--button-min-height': `${Math.round(36 * metrics.densityScale)}px`,
    '--table-cell-y': `${Math.round(12 * metrics.densityScale)}px`,
    '--table-cell-x': `${Math.round(16 * metrics.densityScale)}px`,
    '--pos-gap': `${Math.round(12 * metrics.densityScale)}px`,
    '--compact-80': `${Math.round(80 * metrics.densityScale)}px`,
    '--legacy-billing-offset': `${Math.round(230 * metrics.densityScale)}px`,
    '--purchase-history-offset': `${Math.round(260 * metrics.densityScale)}px`
  };

  return (
    <div className="adaptive-layout" data-compact={metrics.compact ? 'true' : 'false'} style={style}>
      {children}
    </div>
  );
}
