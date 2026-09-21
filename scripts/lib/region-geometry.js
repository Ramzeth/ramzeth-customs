// Geometry of region shapes. Nothing here knows about any particular spell —
// any line template produces the same endpoints.

// Currently unused: endpoints are taken from the region as they are. Kept
// because the snapping mode is the one non-obvious part of the grid API and
// worth not having to rediscover.
export function snapToVertex(point) {
  return canvas.grid.getSnappedPoint(point, {
    mode: CONST.GRID_SNAPPING_MODES.VERTEX,
    resolution: 1
  });
}

// A line shape is a ray: it starts at (x, y) and is then rotated, with zero
// pointing east and the angle growing clockwise on screen — 90 points down,
// 270 up.
//
// The endpoints are returned exactly as the region defines them, with no
// snapping of our own. Whatever the player placed is what gets built, and a
// wall that does not match its region would be worse than one standing
// slightly off the grid. In practice placeRegion has already put the ends on
// vertices, so neighbouring sections still meet exactly.
export function lineEndpoints(shape) {
  const theta = (shape.rotation ?? 0) * Math.PI / 180;
  return {
    a: { x: shape.x, y: shape.y },
    b: {
      x: shape.x + shape.length * Math.cos(theta),
      y: shape.y + shape.length * Math.sin(theta)
    }
  };
}
