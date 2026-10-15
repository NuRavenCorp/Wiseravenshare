export const TIERS = [
  { name: "Fledgling", min: 0, color: "text-muted-foreground", desc: "New to the flock" },
  { name: "Soarer", min: 100, color: "text-blue-400", desc: "Rising on the thermal" },
  { name: "Sentinel", min: 500, color: "text-primary", desc: "Watching with keen eyes" },
  { name: "Sage", min: 2000, color: "text-accent", desc: "Wise and respected" },
  { name: "Maven", min: 10000, color: "text-glow-gold", desc: "Master of the flock" },
];

export function getTier(balance) {
  let tier = TIERS[0];
  for (const t of TIERS) {
    if (balance >= t.min) tier = t;
  }
  return tier;
}

export function getNextTier(balance) {
  return TIERS.find((t) => t.min > balance) || null;
}