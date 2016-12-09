var WIDTH = 100,
    HEIGHT = 32,
    COLOR_BLACK = '#000000',
    COLOR_WHITE = '#FFFFFF',
    COLOR_GREEN = '#00AA00',
    COLOR_RED = '#AA0000',
    COLORMAP = [COLOR_BLACK, COLOR_GREEN, COLOR_RED, COLOR_WHITE],
    MODE_TEXT = 0x0;
    
var CHARMAP = [
  null,'+','-','*','/','_','.',',',';','>','<','?','!','"','(',')',
  '0','1','2','3','4','5','6','7','8','9','=',':','[',']','{','}',
  ' ','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O',
  'P','Q','R','S','T','U','V','W','X','Y','Z','@','#','$','%','&'
];

var Screen = function (outputElement, screenMem) {
  this.pxSize = 4;
  this.el = outputElement;
  this.ctx = this.el.getContext('2d');
  this.setupElement();
  this.mem = screenMem;
  this.mode = MODE_TEXT;
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
  switch (this.mode) {
    case MODE_TEXT:
      this.renderText();
      break;
    default:
      throw new Error('Unknown mode ' + this.mode);
  }
}

Screen.prototype.renderText = function () {
  this.ctx.font = this.realPxToscrPx(8) + 'px monospace';
  this.ctx.textBaseline = "top";
  for (var o = 0; o < 80; o++) {
    var cbyte = this.mem[o],
      status = (cbyte & 0b11000000) >> 6,
      char = (cbyte & 0b00111111),
      str = CHARMAP[char],
      x = o % 20,
      y = Math.floor(o / 20);
    this.ctx.fillStyle = COLORMAP[status];
    this.ctx.fillText(str, this.realPxToscrPx(x) * 5, this.realPxToscrPx(y) * 8, this.realPxToscrPx(5));
  }
};

module.exports = Screen;
