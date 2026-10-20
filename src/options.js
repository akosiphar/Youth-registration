// Edit these lists to match your community. Anything new typed in the form
// is remembered on that device and suggested next time.
export const SCHOOLS = [
  "Cachapero Academe, Inc.",
  "Cavite Christian School",
  "Cavite State University",
  "Christian Values School",
  "Dasmariñas Integrated High School",
  "Emilio Aguinaldo College",
  "Mapua University",
  "Mariano Gomez National High School",
  "National College of Science and Technology",
  "University of Perpetual Help",
  "Philippine Christian University",
  "Philippine Normal University",
];

export const WORKPLACES = [
  "Accenture",
  "Concentrix",
  "Teleperformance",
  "Government",
  "Self-employed",
];

export const OTHERS = 'Others'

const KEY = "customOptions";

export function loadCustom() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function rememberCustom(type, value) {
  const v = value.trim();
  if (!v) return;
  const custom = loadCustom();
  const base = type === "School" ? SCHOOLS : WORKPLACES;
  const list = custom[type] || [];
  if ([...base, ...list].some((x) => x.toLowerCase() === v.toLowerCase()))
    return;
  custom[type] = [...list, v];
  try {
    localStorage.setItem(KEY, JSON.stringify(custom));
  } catch {
    /* ignore */
  }
}

export function optionsFor(type) {
  const base = type === "School" ? SCHOOLS : WORKPLACES;
  return [...base, ...(loadCustom()[type] || [])];
}
