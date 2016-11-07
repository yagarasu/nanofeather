(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Memory = require('../Memory');
var Screen = require('../Screen');

var CPU = function (options) {
  this.memory = new Memory();
  this.output = options.output;
  this.outputMemory = this.memory.getMap(0x1C1F, 800);
  this.screen = new Screen(output, this.outputMemory);
  this.screen.render();
  this.PC = 0x0000;
  this.SP = 0x1C1F;
  this.halted = false;
  this.timer = null;
};

CPU.prototype.loadProgram = function (prog, offset) {
  offset = offset || 0;
  for (var o = 0; o < prog.length; o++) {
    var oo = offset + o;
    this.memory.writeMem(oo, prog[o]);
  }
};

CPU.prototype.step = function () {
  var cmd = this.memory.readMem(this.PC);
  switch (cmd) {
    case 0x0000:
      this.halt();
      break;
    default:
      console.log('step', cmd);
      this.PC++;
  }
};

CPU.prototype.run = function () {
  this.halted = false;
  this.clock = setInterval(function () {
    this.step();
  }.bind(this), 1000);
};

CPU.prototype.halt = function () {
  console.log('HALTED');
  this.halted = true;
  clearInterval(this.clock);
  this.clock = null;
};

module.exports = CPU;

},{"../Memory":2,"../Screen":3}],2:[function(require,module,exports){
var Memory = function () {
  this._raw = new ArrayBuffer(8000);
  this.mem = new Uint8Array(this._raw, 0);
  this.registers = new Uint8Array(4);
  this.length = 8000;
};

Memory.prototype.writeReg = function (reg, value) {
  if (reg >= this.registers.length) throw new Error('Invalid register');
  this.registers[reg] = value;
};

Memory.prototype.readReg = function (reg) {
  if (reg >= this.registers.length) throw new Error('Invalid register');
  return this.registers[reg];
};

Memory.prototype.writeMem = function (address, value) {
  if (address >= this.mem.length) throw new Error('Invalid memory location');
  this.mem[address] = value;
};

Memory.prototype.readMem = function (address) {
  if (address >= this.mem.length) throw new Error('Invalid memory location');
  return this.mem[address];
};

Memory.prototype.getMap = function (address, length) {
  if (address >= this.mem.length) throw new Error('Invalid memory location');
  if (address + length > this.mem.length) throw new Error('Memory length overflow');
  return new Uint8Array(this._raw, address, length);
}

module.exports = Memory;

},{}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

cpu.run();

},{"./CPU":1}]},{},[4]);
