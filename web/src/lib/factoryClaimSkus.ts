/** Allowlisted SKUs shown on the factory-claim tab (first-seen order, unique). */
export const FACTORY_CLAIM_SKUS: string[] = [
  "ATB092116",
  "ATB092105",
  "ATB092115",
  "ATB092123",
  "ATB092128",
  "ATB092037",
  "ATB092129",
  "ATB092139",
  "ATB092125",
  "ATB092141",
  "ATB092121",
  "ATB92119",
  "ATB092127",
  "ATB092135",
  "ATB092117",
  "ATB092124",
  "ATB092114",
  "ATB092138",
  "ATB092113",
  "ATB092134",
  "ATB092133",
  "ATB092137",
  "ATB092140",
  "ATB092160",
  "ATB092159",
  "ATB092158",
  "ATB092157",
  "ATB092156",
  "ATB092155",
  "ATB092153",
  "ATB092152",
  "ATB092151",
  "ATB092150",
  "ATB092149",
  "ATB092145",
  "ATB092146",
  "ATB092163",
  "ATB92049",
  "ATB092063",
  "ATB092061",
  "ATB092060",
  "ATB092068",
  "ATB092053",
  "ATB092102",
  "ATB092103",
  "EU0003",
  "ATB092154",
  "ATB092108",
  "ATB092070",
  "ATB092084",
  "ATB092122",
  "ATB09210",
  "ATB011015",
  "EU0006",
  "EU0004",
  "ATB092087",
  "ATB092086",
  "ATB092082",
  "ATB092101",
  "ATB092081",
  "ATB092069",
  "ATB092144",
  "ATB092130",
  "ATB092112",
  "ATB092067",
  "ATB092106",
  "ATB0920667",
  "ATB0920668",
  "ATB092066",
  "ATB092065",
  "ATB092064",
  "ATB092085",
  "ATB092109",
  "ATB092110",
  "ATB092100",
  "ATB092055",
  "ATB092054",
  "ATB092104",
  "ATB092107",
  "ATB015005",
  "ATB014011",
  "ATB092089",
  "ATB092090",
  "ATB092111",
  "ATB092080",
  "ATB091002",
  "ATB092083",
  "ATB092088",
  "ATB092098",
  "ATB092094",
  "ATB092097",
  "ATB092095",
  "ATB092099",
  "ATB092096",
  "ATB092142",
  "ATB092136",
  "ATB092143",
  "ATB092161",
];

export const FACTORY_CLAIM_SKU_SET = new Set(FACTORY_CLAIM_SKUS);

/** undefined = all allowlisted; [] = none; otherwise intersect with allowlist. */
export function resolveFactorySkus(skus?: string[] | null): string[] {
  if (skus == null) return [...FACTORY_CLAIM_SKUS];
  if (skus.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of skus) {
    const sku = raw.trim();
    if (!sku || seen.has(sku) || !FACTORY_CLAIM_SKU_SET.has(sku)) continue;
    seen.add(sku);
    out.push(sku);
  }
  return out;
}

export function parseSkusParam(raw: string | null): string[] {
  if (raw == null) return resolveFactorySkus(null);
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];
  return resolveFactorySkus(parts);
}

export function skuInSql(
  column: string,
  skus: string[]
): { sql: string; args: string[] } {
  if (skus.length === 0) return { sql: "1=0", args: [] };
  return {
    sql: `${column} IN (${skus.map(() => "?").join(",")})`,
    args: skus,
  };
}
