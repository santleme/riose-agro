/** Project grid coordinates into a 2:1 isometric plane. */
export function projectIso(column, row, cellWidth = 64, cellHeight = 32, origin = {x: 0, y: 0}) {
  return {
    x: origin.x + (column - row) * cellWidth / 2,
    y: origin.y + (column + row) * cellHeight / 2,
  };
}

/** Invert projectIso for coordinates in the same pixel space. */
export function unprojectIso(x, y, cellWidth = 64, cellHeight = 32, origin = {x: 0, y: 0}) {
  const horizontal = (x - origin.x) / (cellWidth / 2);
  const vertical = (y - origin.y) / (cellHeight / 2);
  return {
    column: (horizontal + vertical) / 2,
    row: (vertical - horizontal) / 2,
  };
}
