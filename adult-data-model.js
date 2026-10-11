export function parseAdultCperCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = header.split(',');
  return lines.filter(Boolean).map(line => {
    const cells = line.split(',');
    const row = Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
    return {
      year: Number(row.Year), period: Number(row['60dADG_INT']), paddock: row.Pasture, eartag: row.Eartag,
      days: Number(row.DaysData), bout: Number(row.GBD_5min), hours: Number(row.GrazeHrs_5min),
      velocity: Number(row.MeanVelo), adg: Number(row.ADG_60d),
    };
  });
}
