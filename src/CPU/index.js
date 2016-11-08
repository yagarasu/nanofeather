var Memory = require('../Memory');
var Screen = require('../Screen');

var CPU = function (options) {
  this.memory = new Memory();
  window.memory = this.memory;
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

CPU.prototype.getNextByte = function () {
  console.log('getNextByte');
  return this.memory.readMem(this.PC++);
};

CPU.prototype.step = function () {
  console.log('STEP', this.PC);
  var cmd = this.getNextByte();
  console.log(cmd.toString(2));
  // 0x00 HLT
  if (cmd == 0x00) {
    this.halt();
    return;
  }
  // Prefix: 000xxxxx
  if (cmd >> 5 === 0) {
    console.log('Prefixed');
  } else {
    // Not prefixed
    var op = (cmd & 0xE0) >> 5; // 1110 0000
    var rr = (cmd & 0x18) >> 3; // 0001 1000
    var mmm = cmd & 0x7; // 0000 0111
    console.log('op', op.toString(2), 'rr', rr.toString(2), 'mmm', mmm.toString(2));
    var arg;
    if (mmm & 0x4 === 0) {
      // Arg is reg
      arg = mmm & 0x3; // 0000 0011
    }
    if (mmm & 0x4 === 4) {
      // Arg is [B]
      arg = this.memory.readMem(this.memory.readReg(1));
    }
    if (mmm & 0x5 === 5) {
      // Arg is [B + offset]
      var offset = this.getNextByte();
      arg = this.memory.readMem(this.memory.readReg(1) + offset);
    }
    if (mmm & 0x6 === 6) {
      // Arg is [const]
      var constant = this.getNextByte();
      arg = this.memory.readMem(constant);
    }
    if (mmm & 0x7 === 7) {
      // Arg is const
      arg = this.getNextByte();
    }
    // Parse op
    switch (op) {
      case 1:
        // OR
        this.memory.writeReg(
          rr,
          this.memory.readReg(rr) | arg
        );
        break;
      case 2:
        // AND
        this.memory.writeReg(
          rr,
          this.memory.readReg(rr) & arg
        );
        break;
      case 3:
        // CMP
        // var regCont = this.memory.readReg(rr);
        break;
      case 4:
        // SUB
        this.memory.writeReg(
          rr,
          this.memory.readReg(rr) - arg
        );
        break;
      case 5:
        // ADD
        this.memory.writeReg(
          rr,
          this.memory.readReg(rr) | arg
        );
        break;
      case 6:
        // MOV reg, arg
        this.memory.writeReg(rr, arg);
        break;
      case 7:
        // MOV arg, reg
        this.memory.writeMem(arg, rr);
        break;
      default:
        throw new Error('Unknown sub-opcode:' + op);
    }
    return;
  }
  
  // Default    
  console.log('Default', cmd);
  this.PC++;
  return;
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
