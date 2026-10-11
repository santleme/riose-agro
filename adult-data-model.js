function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      cells.push(cell); cell = '';
    } else cell += character;
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = parseCsvLine(header);
  return lines.filter(Boolean).map(line => {
    const values = parseCsvLine(line);
    return Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  });
}

export function parseAdultCperCsv(text) {
  return parseCsv(text).map(row => ({
    year: Number(row.Year), period: Number(row['60dADG_INT']), paddock: row.Pasture, eartag: row.Eartag,
    days: Number(row.DaysData), bout: Number(row.GBD_5min), hours: Number(row.GrazeHrs_5min),
    velocity: Number(row.MeanVelo), adg: Number(row.ADG_60d),
  }));
}

export function parseDailyCperCsv(text) {
  return parseCsv(text).map(row => {
    const number = value => value?.trim() ? Number(value) : Number.NaN;
    const [month, day, year] = row.Date.split('/').map(Number);
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const minutes = number(row.DayLengthMinutes);
    return {
      date, year, paddock: row.Pasture, eartag: row.Eartag,
      bout: number(row.GBD_5min), grazingHours: number(row.GrazeHrs_4sec),
      velocity: number(row.MeanVelo), biomass: number(row.Biomass), dayLengthMinutes: minutes,
      complete: Number.isFinite(minutes) && minutes >= 1368 && minutes <= 1512,
    };
  });
}
