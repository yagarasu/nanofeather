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
    case 0x00:
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
