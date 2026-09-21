// Geometry of region shapes. Nothing here knows about any particular spell —
// any line template produces the same endpoints.

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
// placeRegion already snaps the endpoints to vertices, so snapping again is
// usually a no-op. It stays as insurance: two adjacent sections whose shared
// endpoint differs by a fraction of a pixel leave a gap that sight passes
// through, which defeats the point of building a wall at all.
export function lineEndpoints(shape) {
  const theta = (shape.rotation ?? 0) * Math.PI / 180;
  return {
    a: snapToVertex({ x: shape.x, y: shape.y }),
    b: snapToVertex({
      x: shape.x + shape.length * Math.cos(theta),
      y: shape.y + shape.length * Math.sin(theta)
    })
  };
}
