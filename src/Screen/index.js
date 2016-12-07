var Screen = function (outputElement, screenMem) {
  this.pxSize = 4;
  this.el = outputElement;
  this.ctx = this.el.getContext('2d');
  this.setupElement();
  this.mem = screenMem;
};

Screen.prototype.setupElement = function () {
  this.el.width = this.realPxToscrPx(100).toString();
  this.el.height = this.realPxToscrPx(32).toString();
  this.clear();
};

Screen.prototype.realPxToscrPx = function (px) {
  return px * 4;
};

Screen.prototype.scrPxTorealPx = function (px) {
  return Math.floor(px / 4);
};

Screen.prototype.clear = function () {
  // @todo
};

Screen.prototype.render = function () {
  for (var o = 0; o < this.mem.length; o++) {
    var cbyte = this.mem[o],
        h = (cbyte & 0xFF00) >> 8,
        l = (cbyte & 0x00FF);
    var char = String.fromCharCode(h);
    // @todo
  }
};

module.exports = Screen;
