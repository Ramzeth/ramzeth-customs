const MOD = "ramzeth-customs";
const WALL_OF_STONE = "origin:item:slug:wall-of-stone";
const STONE_COLOR = "#6b6b6b";

Hooks.once("ready", () => {
  libWrapper.register(MOD,
     "canvas.regions.constructor.prototype.placeRegion",
     function (wrapped, data, options) {
           const ro = data?.flags?.pf2e?.origin?.rollOptions ?? [];
           if (ro.includes(WALL_OF_STONE) && data?.shapes?.[0]) {
               data = foundry.utils.deepClone(data);
               data.shapes[0].width = Math.max(2, Math.round(canvas.grid.size / 16));
	       data.color = STONE_COLOR;
	   }
	   return wrapped(data, options);
     }, "WRAPPER");
});
