// Turns one constraint layer's site-check result (meta.site_check in the site_selection database) into a
// plain verdict at the analyst's chosen search radius: on the site, within the search area, clear, or no data.
// Pure functions, no React or map code, so the report, its map and its tests all read the same answer.

// Colour is data: these encode the result and are used for nothing else in the report (palette in DESIGN.md,
// "Site appraisal report"). Red and gold are the review-flag "False Positive" and "Public Park Caution" colours;
// moss is "Good Candidate". `ink` is the darker partner used for text, which needs AA contrast on cream.
// These labels are the one vocabulary for results: use them everywhere, don't paraphrase.
export const CHECK_STATUS = {
  'on-site': { label: 'On the site', colour: '#B33A3A', ink: '#A33232', rank: 0 },
  within: { label: 'Within the search area', colour: '#C9A227', ink: '#7D630F', rank: 1 },
  clear: { label: 'Clear', colour: '#6F8443', ink: '#4F6030', rank: 2 },
  unknown: { label: 'No data', colour: '#9D9D91', ink: '#74786D', rank: 3 },
};

export const metres = value => `${Math.round(Number(value)).toLocaleString('en-GB')} m`;
const named = feature => feature.name || 'Unnamed area';

export function listNames(features, max = 3) {
  const names = [...new Set(features.map(named))];
  return names.length > max ? `${names.slice(0, max).join(', ')} and ${names.length - max} more` : names.join(', ');
}

// layer: { check, value (search radius in m) }. basis: 'boundary' | 'point'.
export function assessLayer(layer, basis) {
  const check = layer.check;
  if (!check) return null;
  const radius = layer.value;
  if (!check.has_data) {
    return { status: 'unknown', radius, onSite: [], within: [], nearestOutside: null, headline: 'No data loaded for this layer, so treat it as unknown.' };
  }
  const onSite = check.features.filter(feature => feature.on_site);
  const within = check.features.filter(feature => !feature.on_site && feature.distance_m <= radius);
  const nearestOutside = check.features.find(feature => !feature.on_site && feature.distance_m > radius) || null;
  const status = onSite.length ? 'on-site' : within.length ? 'within' : 'clear';

  let headline;
  if (status === 'on-site') {
    const cover = check.pct_cover !== null && check.pct_cover !== undefined ? `, covering ${check.pct_cover}% of the site` : '';
    headline = `${basis === 'boundary' ? 'Overlaps' : 'Site point falls within'} ${listNames(onSite)}${cover}.`;
    if (within.length) headline += ` ${within.length} more within ${metres(radius)}.`;
  } else if (status === 'within') {
    headline = `${within.length} within ${metres(radius)}. Nearest is ${named(within[0])} at ${metres(within[0].distance_m)}.`;
  } else {
    headline = nearestOutside
      ? `None within ${metres(radius)}. Nearest is ${named(nearestOutside)} at ${metres(nearestOutside.distance_m)}.`
      : `None within ${metres(radius)}, or within the ${metres(check.max_m || 3000)} checked.`;
  }
  return { status, radius, onSite, within, nearestOutside, pctCover: check.pct_cover ?? null, headline };
}

// Counts per status for a section's included, checked layers
export function summarise(assessments) {
  const counts = { 'on-site': 0, within: 0, clear: 0, unknown: 0 };
  assessments.filter(Boolean).forEach(assessment => { counts[assessment.status] += 1; });
  return counts;
}

// Map features for a section, each tagged on-site / within / outside relative to its own layer's radius.
// labelled: the features the report names (everything on site or within, plus each layer's nearest outside one).
// context: that nearest outside feature, which the map frames so close context is visible, not just the ring.
export function mapFeatures(layers) {
  return layers.flatMap(layer => {
    const features = (layer.check?.features || []).filter(feature => feature.geojson);
    const nearestOutside = features.find(feature => !feature.on_site && feature.distance_m > layer.value);
    return features.map(feature => {
      const status = feature.on_site ? 'on-site' : feature.distance_m <= layer.value ? 'within' : 'outside';
      const isNearestOutside = feature === nearestOutside;
      return {
        type: 'Feature',
        geometry: feature.geojson,
        properties: {
          status,
          name: named(feature),
          layer: layer.label,
          distance_m: feature.distance_m,
          labelled: status !== 'outside' || isNearestOutside,
          context: isNearestOutside,
          // Outside features carry their distance in the label, since that's what makes them worth showing
          label: status === 'outside' ? `${named(feature)} · ${metres(feature.distance_m)}` : named(feature),
        },
      };
    });
  });
}

// Expand [minLon, minLat, maxLon, maxLat] over any GeoJSON geometry's coordinates
export function extendBounds(bounds, geometry) {
  const walk = coords => {
    if (typeof coords[0] === 'number') {
      bounds[0] = Math.min(bounds[0], coords[0]); bounds[1] = Math.min(bounds[1], coords[1]);
      bounds[2] = Math.max(bounds[2], coords[0]); bounds[3] = Math.max(bounds[3], coords[1]);
    } else coords.forEach(walk);
  };
  walk(geometry.coordinates);
  return bounds;
}
