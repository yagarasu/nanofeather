(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Memory = require('../Memory');
var Screen = require('../Screen');

var log = function () {
  var debug = true;
  if (debug) {
    console.log.apply(this, arguments);
  }
};

var CPU = function (options) {
  this.memory = new Memory();
  window.memory = this.memory;
  this.output = options.output;
  this.outputMemory = this.memory.getMap(0x1C1F, 800);
  this.screen = new Screen(this.output, this.outputMemory);
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

CPU.prototype.getNextByte = function () {
  log('getNextByte');
  return this.memory.readMem(this.PC++);
};

module.exports = CPU;
},{"../Memory":2,"../Screen":3}],2:[function(require,module,exports){
var Memory = function () {
  this._raw = new ArrayBuffer(64000);
  this.mem = new Uint16Array(this._raw, 0);
  this.registers = new Uint16Array(4);
  this.flags = 0x0;
  this.length = 8000;
  this.FLAG = {
    CARRY: 0x80,
    PARITY: 0x40,
    ZERO: 0x20,
    SIGN: 0x10,
    OVERFLOW: 0x08
  }
};

Memory.prototype.writeReg = function (reg, value) {
  if (reg >= this.registers.length) throw new Error('Invalid register');
  return this.registers[reg] = value;
};

Memory.prototype.readReg = function (reg) {
  if (reg >= this.registers.length) throw new Error('Invalid register');
  return this.registers[reg];
};

Memory.prototype.writeMem = function (address, value) {
  if (address >= this.mem.length) throw new Error('Invalid memory location');
  return this.mem[address] = value;
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

Memory.prototype.getFlag = function (flag) {
  if (this.FLAG[flag] === undefined) throw new Error('Invalid flag ' + flag);
  return this.flags & this.FLAG[flag];
};

Memory.prototype.setFlag = function (flag) {
  if (this.FLAG[flag] === undefined) throw new Error('Invalid flag ' + flag);
  console.log('Set flag:', flag)
  return this.flags = this.flags | this.FLAG[flag];
};

Memory.prototype.resetFlag = function (flag) {
  if (this.FLAG[flag] === undefined) throw new Error('Invalid flag ' + flag);
  console.log('Reset flag:', flag)
  return this.flags = this.flags & ~this.FLAG[flag];
};

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

},{}],4:[function(require,module,exports){
var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

var program = new Uint16Array([
  
]);

cpu.loadProgram(program);
//cpu.run();

},{"./CPU":1}]},{},[4]);
