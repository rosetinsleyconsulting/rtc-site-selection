export const siteFields = [
  'type',
  'borough',
  'site_name',
  'category',
  'priority',
  'footprint_m2',
  'spare_land_on_title_m2',
  'voa_rateable_value',
  'voa_match_confidence',
  'nearby_planning_applications',
  'nearby_parking',
  'data_confidence_notes',
  'spare_area_comments',
  'lat',
  'lon',
];

export function parseCSV(text = '') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some(value => value.trim() !== '')) rows.push(row);
  }

  const [, ...data] = rows;
  return data
    .filter(values => values.length > 1)
    .map((values, index) => ({
      id: index + 1,
      ...Object.fromEntries(siteFields.map((field, fieldIndex) => [field, values[fieldIndex] ?? ''])),
    }));
}

export function toNullableNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  if (String(value).toLowerCase().includes('n/a')) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}