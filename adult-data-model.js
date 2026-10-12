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
    turnAngle: Number(row.MeanTA), velocity: Number(row.MeanVelo), adg: Number(row.ADG_60d),
  }));
}

export function filterAdultCperRows(rows, {period = 'all', paddock = 'all'} = {}) {
  return rows.filter(row => (period === 'all' || String(row.period) === String(period))
    && (paddock === 'all' || row.paddock === paddock));
}

export function summarizeAdultCperRows(rows) {
  return {
    records: rows.length,
    uniqueAnimals: new Set(rows.map(row => row.eartag)).size,
    uniquePaddocks: [...new Set(rows.map(row => row.paddock))].sort(),
    years: [...new Set(rows.map(row => row.year))].sort((a, b) => a - b),
    periods: [...new Set(rows.map(row => row.period))].sort((a, b) => a - b),
  };
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
      turnAngle: number(row.MeanTA), velocity: number(row.MeanVelo), biomass: number(row.Biomass), dayLengthMinutes: minutes,
      complete: Number.isFinite(minutes) && minutes >= 1368 && minutes <= 1512,
    };
  });
}

export function parseRothamstedCattleCsv(text) {
  const numberOrNaN = value => value?.trim() && value.trim().toUpperCase() !== 'NA' ? Number(value) : Number.NaN;
  return parseCsv(text).map(row => {
    const dateFrom = row.Date_From;
    const dateTo = row.Date_To;
    const dob = row.DOB;
    const elapsedDays = Math.round((Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86400000);
    const ageAtStartDays = Math.round((Date.parse(`${dateFrom}T00:00:00Z`) - Date.parse(`${dob}T00:00:00Z`)) / 86400000);
    const startWeight = numberOrNaN(row.LWt_Start);
    const endWeight = numberOrNaN(row.LWt_End);
    return {
      plot: row.Plot_ID, year: Number(row.Year), cohort: Number(row.Cohort_number),
      animal: row.Tag_Official, tag: row.Tag_4, breed: row.Breed,
      dob, dateFrom, dateTo, ageAtStartDays, startWeight, endWeight, elapsedDays,
      weightChange: endWeight - startWeight, adg: numberOrNaN(row.DLWG),
    };
  });
}

export function parseRothamstedHerbageCsv(text) {
  const numberOrNaN = value => value?.trim() && value.trim().toUpperCase() !== 'NA' ? Number(value) : Number.NaN;
  return parseCsv(text).map(row => ({
    date: row.Date, plot: row.Plot_ID, biomass: numberOrNaN(row.DM_HM),
  }));
}

export function parseCgrecCsv(text) {
  return parseCsv(text).map(row => {
    const number = value => {
      const normalized = String(value ?? '').trim().replace(/^\$/, '').replaceAll(',', '');
      return normalized && normalized.toUpperCase() !== 'NA' ? Number(normalized) : Number.NaN;
    };
    const poundsToKg = value => Number.isFinite(value) ? value / 2.2046226218 : Number.NaN;
    const tag = String(row.TAG ?? '').trim();
    const year = number(row.YEAR);
    const adgLb = number(row.ADG);
    return {
      recordId: String(row.datum ?? '').trim(), year, tag, sex: String(row.SEX ?? '').trim(), pasture: String(row.PASTURE ?? '').trim(),
      treatment: String(row.TRT ?? '').trim(), days: number(row.ADG_DAYS), grazingDays: number(row.GRAZING_DAYS),
      initialWeightKg: poundsToKg(number(row.INIT_WT)), finalWeightKg: poundsToKg(number(row.FINAL_WT)),
      adgLb, adgKg: poundsToKg(adgLb), grossReturnUsd: number(row.GROSS_RETURN),
    };
  });
}

export function parseHpgrsCsv(text) {
  const numberOrNaN = value => {
    const normalized = String(value ?? '').trim();
    return normalized && normalized.toUpperCase() !== 'NA' ? Number(normalized) : Number.NaN;
  };
  return parseCsv(text.replace(/^\uFEFF/, '')).map(row => {
    const days = numberOrNaN(row.days);
    const weightGainKg = numberOrNaN(row['gain kg']);
    return {
      year: numberOrNaN(row.Year), onDate: row['on date'], offDate: row['off date'], days,
      tag: String(row['Tag '] ?? '').trim(), gender: String(row.gender ?? '').trim(),
      treatment: String(row.treatment ?? '').trim(), stockingRateAuDaysHa: numberOrNaN(row.SR_AUDperHa),
      initialWeightKg: numberOrNaN(row['on kg']), finalWeightKg: numberOrNaN(row['off kg']), weightGainKg,
      adgKgPerDay: Number.isFinite(days) && days > 0 && Number.isFinite(weightGainKg) ? weightGainKg / days : Number.NaN,
    };
  });
}
