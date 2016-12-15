var MemViewer = function (canvas, buffer, offset) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.buffer = buffer;
  this.offset = offset;
  this.pxSize = 4;
  this.viewportLength = 1024;
  console.log(this.viewportLength);
};

MemViewer.prototype.getPx = function (val) {
  return val * this.pxSize;
};

MemViewer.prototype.render = function () {
  var len = (this.offset + this.viewportLength > this.buffer.byteLength) ? undefined : this.viewportLength;
  console.log(this.buffer, this.offset, len);
  var data = new Uint8Array(this.buffer, this.offset, len);
  var vpw = Math.floor(this.canvas.width / 4);
  for (var o = 0; o < this.viewportLength; o++) {
    var x = o % vpw, y = Math.floor(o / vpw);
    var d = data[o], c = d.toString(16), ccc = c+c+c;
    this.ctx.fillStyle = '#' + ccc;
    this.ctx.fillRect(this.getPx(x), this.getPx(y), this.getPx(1), this.getPx(1));
  }
};

module.exports = MemViewer;