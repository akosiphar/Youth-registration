// Image-driven theming: pull a dominant hue out of an uploaded picture, derive
// a dark palette from it and apply it as CSS variables. All client-side, so it
// works offline. Only the hue/saturation and a small cropped banner are stored.

const KEY = "theme";
const EVENT = "themechange";
const BANNER_MAX = 1200;

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [r + m, g + m, b + m].map((v) => Math.round(v * 255));
}

const css = (h, s, l, a) => {
  const [r, g, b] = hslToRgb(h, s, l);
  return a == null ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;
};

function luminance([r, g, b]) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

export const DEFAULT_THEME = { hue: 40, sat: 0.78 };

// Builds every CSS variable the stylesheet uses from a single hue + saturation.
export function buildPalette({ hue: h, sat }) {
  const s = Math.min(0.9, Math.max(0.5, sat));
  const light = hslToRgb(h, s, 0.78);
  const dark = hslToRgb(h, s, 0.45);
  // Button label colour: whichever of near-black / white reads best on both gradient stops.
  const ink = hslToRgb(h, 0.6, 0.07);
  const white = [255, 255, 255];
  const worst = (c) => Math.min(contrast(c, light), contrast(c, dark));
  const onAccent = worst(ink) >= worst(white) ? css(h, 0.6, 0.07) : "#fff";

  return {
    "--gold": css(h, s, 0.62),
    "--gold-light": css(h, s, 0.78),
    "--gold-dark": css(h, s, 0.45),
    "--accent-rgb": hslToRgb(h, s, 0.62).join(", "),
    "--on-accent": onAccent,
    "--text": css(h, 0.35, 0.92),
    "--muted": css(h, 0.15, 0.68),
    "--label": css(h, 0.25, 0.82),
    "--placeholder": css(h, 0.12, 0.5),
    "--bg-1": css(h, 0.4, 0.14),
    "--bg-2": css(h, 0.45, 0.07),
    "--bg-3": css(h, 0.5, 0.04),
    "--card-bg": css(h, 0.4, 0.07, 0.82),
    "--option-bg": css(h, 0.4, 0.09),
    "--border": css(h, s, 0.62, 0.22),
  };
}

export function applyTheme(theme) {
  const palette = buildPalette(theme ?? DEFAULT_THEME);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(palette)) root.style.setProperty(k, v);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", palette["--bg-2"]);
}

export function loadTheme() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveTheme(theme) {
  try {
    if (theme) localStorage.setItem(KEY, JSON.stringify(theme));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage full or blocked: theme still applies for this session */
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(EVENT));
}

export const onThemeChange = (fn) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

// Up to 4 distinct accent colours, most prominent first.
function dominantAccents(img) {
  const scale = 96 / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const BINS = 36;
  const bins = Array.from({ length: BINS }, () => ({ weight: 0, sat: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const [hue, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    // Ignore greys, near-black and near-white; favour vivid, mid-tone pixels.
    if (s < 0.25 || l < 0.12 || l > 0.9) continue;
    const weight = s * (1 - Math.abs(2 * l - 1));
    const bin = bins[Math.floor(hue / (360 / BINS)) % BINS];
    bin.weight += weight;
    bin.sat += s * weight;
  }

  const ranked = bins
    .map((b, i) => ({
      hue: i * (360 / BINS) + 360 / BINS / 2,
      weight: b.weight,
      sat: b.weight ? b.sat / b.weight : 0,
    }))
    .filter((b) => b.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const picked = [];
  for (const c of ranked) {
    const far = picked.every(
      (p) =>
        Math.min(Math.abs(p.hue - c.hue), 360 - Math.abs(p.hue - c.hue)) >= 40,
    );
    if (far)
      picked.push({
        hue: Math.round(c.hue),
        sat: Math.round(c.sat * 100) / 100,
      });
    if (picked.length === 4) break;
  }
  return picked.length ? picked : [DEFAULT_THEME];
}

// Keep the whole picture (no cropping), scaled down so it stays small in storage.
function makeBanner(img) {
  const scale = Math.min(1, BANNER_MAX / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export async function analyseImage(file) {
  const img = await loadImage(file);
  return { accents: dominantAccents(img), banner: makeBanner(img) };
}
