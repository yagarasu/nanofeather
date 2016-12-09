var WIDTH = 100,
    HEIGHT = 32,
    COLOR_BLACK = '#000000',
    COLOR_WHITE = '#FFFFFF',
    COLOR_GREEN = '#00AA00',
    COLOR_RED = '#AA0000';

var Screen = function (outputElement, screenMem) {
  this.pxSize = 4;
  this.el = outputElement;
  this.ctx = this.el.getContext('2d');
  this.setupElement();
  this.mem = screenMem;
};

Screen.prototype.setupElement = function () {
  this.el.width = this.realPxToscrPx(WIDTH).toString();
  this.el.height = this.realPxToscrPx(HEIGHT).toString();
  this.clear();
};

Screen.prototype.realPxToscrPx = function (px) {
  return px * 4;
};

Screen.prototype.scrPxTorealPx = function (px) {
  return Math.floor(px / 4);
};

Screen.prototype.clear = function () {
  this.ctx.fillStyle = COLOR_BLACK;
  this.ctx.fillRect(0, 0, this.realPxToscrPx(WIDTH), this.realPxToscrPx(HEIGHT));
};

Screen.prototype.render = function () {
  for (var o = 0; o < this.mem.length; o++) {
    var cbyte = this.mem[o],
      status = (cbyte & 0b11000000) >> 6,
      char = (cbyte & 0b00111111);
  }
};

module.exports = Screen;
