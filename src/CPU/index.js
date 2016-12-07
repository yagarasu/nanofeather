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