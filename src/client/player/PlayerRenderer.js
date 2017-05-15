import { Canvas2dRenderer } from 'soundworks/client';

/**
 * A simple canvas renderer.
 * The class renders a dot moving over the screen and rebouncing on the edges.
 */
export default class PlayerRenderer extends Canvas2dRenderer {
  constructor(color = '#ffffff') {
    super(0); // update rate = 0: synchronize updates to frame rate

    this.color = color;
    this.bkgColor = '#000000';

    this.bkgChangeColorRequested = false;
  }

  /**
   * Initialize rederer state.
   * @param {Number} dt - time since last update in seconds.
   */
  init() {
  }

  /**
   * Update rederer state.
   * @param {Number} dt - time since last update in seconds.
   */
  update(dt) {
  }

  // mode on off: 1 is color, 0 is black
  setMode(value){
    this.mode = value;
  }

  setColor(color){
    this.color = color;
  }

  /**
   * Draw into canvas.
   * Method is called by animation frame loop in current frame rate.
   * @param {CanvasRenderingContext2D} ctx - canvas 2D rendering context
   */
  render(ctx) {
    // save
    ctx.save();
    // paint all canvas (clean)
    ctx.globalAlpha = 0.05;
    if( this.mode === 1 )
      ctx.fillStyle = this.color;
    else
      ctx.fillStyle = this.bkgColor;
    // ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // ctx.fill();
    ctx.restore();
  }
}
