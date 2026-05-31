/**
 * Levenshtein Distance - calculates edit distance between two strings
 * Used for fuzzy matching in product search
 */
export const levenshteinDistance = (str1, str2) => {
  const track = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }

  return track[str2.length][str1.length];
};

/**
 * Calculate similarity score between two strings (0-1)
 */
export const stringSimilarity = (str1, str2) => {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
  return (longer.length - editDistance) / longer.length;
};

/**
 * Fuzzy search through products
 * Searches by name, SKU, barcode, and product ID
 * Returns results sorted by relevance
 */
export const fuzzySearchProducts = (query, products) => {
  if (!query || !query.trim()) return [];

  const q = query.toLowerCase().trim();
  const results = [];

  for (const product of products) {
    let score = 0;
    let matchType = '';

    const productIdStr = String(product.productId || '');
    const name = (product.name || '').toLowerCase();
    const sku = (product.sku || '').toLowerCase();
    const barcode = (product.barcode || '').toLowerCase();

    // Exact match (highest priority)
    if (productIdStr === q || sku === q || barcode === q) {
      score = 1.0;
      matchType = 'exact';
    }
    // Prefix match (high priority)
    else if (name.startsWith(q) || sku.startsWith(q)) {
      score = 0.95;
      matchType = 'prefix';
    }
    // Contains match (medium priority)
    else if (name.includes(q) || sku.includes(q) || barcode.includes(q) || productIdStr.includes(q)) {
      score = 0.85;
      matchType = 'contains';
    }
    // Fuzzy match on name (medium priority)
    else {
      const nameSimilarity = stringSimilarity(name, q);
      const skuSimilarity = stringSimilarity(sku, q);
      const barcodeSimilarity = stringSimilarity(barcode, q);

      score = Math.max(nameSimilarity, skuSimilarity, barcodeSimilarity);
      matchType = 'fuzzy';

      // Only include if similarity is above threshold
      if (score < 0.6) continue;
    }

    results.push({
      product,
      score,
      matchType
    });
  }

  // Sort by score descending, then by name
  return results
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.product.name || '').localeCompare(b.product.name || '');
    })
    .map(r => r.product);
};

/**
 * Keywords for smart search - breaks down query into keywords
 */
export const extractKeywords = (query) => {
  return query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(k => k.length > 0);
};

/**
 * Multi-keyword search with keyword matching
 */
export const multiKeywordSearch = (query, products) => {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  return products.filter(product => {
    const name = (product.name || '').toLowerCase();
    const sku = (product.sku || '').toLowerCase();
    const barcode = (product.barcode || '').toLowerCase();
    const productIdStr = String(product.productId || '').toLowerCase();

    // ALL keywords must match somewhere in the product
    return keywords.every(keyword => 
      name.includes(keyword) || 
      sku.includes(keyword) || 
      barcode.includes(keyword) ||
      productIdStr.includes(keyword)
    );
  });
};
