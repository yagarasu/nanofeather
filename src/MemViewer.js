var Clock = require('./Clock');

var MemViewer = function (canvas, buffer, offset) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.buffer = buffer;
  this.offset = offset;
  this.pxSize = 4;
  this.viewportLength = 1024;
  this.clock = new Clock(500);
  this.clock.on('tick', function () {
    this.render();
  }.bind(this));
};

MemViewer.prototype.getPx = function (val) {
  return val * this.pxSize;
};

MemViewer.prototype.render = function () {
  var len = (this.offset + this.viewportLength > this.buffer.byteLength) ? undefined : this.viewportLength;
  var data = new Uint8Array(this.buffer, this.offset, len);
  var vpw = Math.floor(this.canvas.width / 4);
  for (var o = 0; o < this.viewportLength; o++) {
    var x = o % vpw, y = Math.floor(o / vpw);
    var d = data[o], c = d.toString(16), ccc = c+c+c;
    this.ctx.fillStyle = '#' + ccc;
    this.ctx.fillRect(this.getPx(x), this.getPx(y), this.getPx(1), this.getPx(1));
  }
};

MemViewer.prototype.start = function () {
  this.clock.start();
};
MemViewer.prototype.stop = function () {
  this.clock.stop();
};

module.exports = MemViewer;