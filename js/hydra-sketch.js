/**
 * Sketch Hydra da vitrine.
 * Para trocar: cole o novo código Hydra dentro de runHydraSketch().
 *
 * Original (Hydra editor):
 *   speed=1
 *   shape(1,1)
 *   .add( noise(1.5,0.03). color(1.5,0,0) )
 *   .add( noise(1.6,0.05). color(0,1.5,0) )
 *   .add( noise(1.7,0.07). color(0,0,1.5) )
 *   .contrast(0.4).brightness(0.2)
 *   .out()
 */
window.runHydraSketch = function runHydraSketch() {
  speed = 1;
  shape(1, 1)
    .add(noise(1.5, 0.03).color(1.5, 0, 0))
    .add(noise(1.6, 0.05).color(0, 1.5, 0))
    .add(noise(1.7, 0.07).color(0, 0, 1.5))
    .contrast(0.4)
    .brightness(0.2)
    .out();
};
