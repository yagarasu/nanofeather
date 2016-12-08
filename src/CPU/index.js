var opcodes = require('./opcodes');
var Memory = require('../Memory');
//var Screen = require('../Screen');

var log = function () {
  var debug = true;
  if (debug) {
    var args = Array.slice(arguments);
    console.log(args.map(function (e) { return (typeof e === 'string') ? e : JSON.stringify(e) }).join("\t"));
  }
};

var CPU = function (options) {
  this.memory = new Memory();
  window.memory = this.memory;
  // this.output = options.output;
  // this.outputMemory = this.memory.getMap(0x1C1F, 800);
  // this.screen = new Screen(this.output, this.outputMemory);
  // this.screen.render();
  this.PC = 0x0000;
  this.SP = 0x1C1F;
  this.halted = true;
  this.timer = null;
  this.speed = 1000;
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

CPU.prototype.halt = function () {
  clearInterval(this.timer);
  this.timer = null;
  this.halted = true;
};

CPU.prototype.run = function () {
  this.halted = false;
  this.timer = setInterval(this.step.bind(this), this.speed);
};

CPU.prototype.step = function () {
  log('==== Step', this.PC);
  try {
    var bc = this.getNextByte();
    var parsed = this.parseBytecode(bc);
    log(parsed);
    switch (parsed.cmd) {
      case 'HLT':
        this.halt();
        break;
        
      case 'ADD':
        log('ADD');
        // Get first arg
        var regA = this.getNextByte(),
            regB = null;
        if (parsed.arg2type === 'R') {
          regB = this.getNextByte();
          this.memory.writeReg(regA, this.memory.readReg(regA) + this.memory.readReg(regB));
        } else if (parsed.arg2type === 'RA') {
          regB = this.getNextByte();
          this.memory.writeReg(regA, this.memory.readReg(regA) + this.memory.readMem(this.memory.readReg(regB)));
        } else if (parsed.arg2type === 'A') {
          var add1 = this.getNextByte(), add2 = this.getNextByte();
          //this.memory.writeReg(regA, this.memory.readReg(regA) + this.memory.readMem(this.memory.readReg(regB)));
        }
        break;
      
      default:
        log('Not implemented yet:' + parsed.cmd);
    }
  } catch (e) {
    this.halt();
    throw e;
  }
};

CPU.prototype.parseBytecode = function (bc) {
  var op = opcodes.bcs[bc];
  var parts = op.match(/^([A-Z]+)(_([A-Z]+))?(_([A-Z]+))?$/);
  if (parts === null) throw new Error('Illegal opcode found: ' + bc);
  var cmd = parts[1],
      ret = { cmd: cmd };
  if (parts.length > 2) {
    ret.arg1type = parts[3];
  }
  if (parts.length > 4) {
    ret.arg2type = parts[5];
  }
  return ret;
};

module.exports = CPU;