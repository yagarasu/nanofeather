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

Screen.prototype.getColorHex = function (bits) {
  switch (bits) {
    case 0: return '#000000'; break;
    case 1: return '#AA0000'; break;
    case 2: return '#00AA00'; break;
    case 3: return '#FFFFFF'; break;
    default: return '#00AA00'; break;
  }
};

Screen.prototype.clear = function () {
  this.ctx.fillStyle = '#000000';
  this.ctx.fillRect(0,0,this.realPxToscrPx(100),this.realPxToscrPx(32));
};

Screen.prototype.putPx = function (x, y, color) {
  this.ctx.fillStyle = color;
  var rx = this.realPxToscrPx(x);
  var ry = this.realPxToscrPx(y);
  var pxwh = this.realPxToscrPx(1);
  this.ctx.fillRect(rx, ry, pxwh, pxwh);
};

Screen.prototype.render = function () {
  for (var offset = 0; offset < this.mem.length; offset++) {
    var byte = this.mem[offset];
    var px1 = (byte & 0xC0) >> 6, // 1100 0000
        px2 = (byte & 0x30) >> 4, // 0011 0000
        px3 = (byte & 0x0C) >> 2, // 0000 1100
        px4 = byte & 0x03; // 0000 0011
    var x1 = (offset % 25) * 4,
        x2 = x1 + 1,
        x3 = x1 + 2,
        x4 = x1 + 3;
    var y = Math.floor(offset / 25);
    this.putPx(x1, y, this.getColorHex(px1));
    this.putPx(x2, y, this.getColorHex(px2));
    this.putPx(x3, y, this.getColorHex(px3));
    this.putPx(x4, y, this.getColorHex(px4));
  }
};

module.exports = Screen;
