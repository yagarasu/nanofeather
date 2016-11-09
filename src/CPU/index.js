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
  
  // Not prefixed
  if (cmd >> 5 !== 0) {
    var op = (cmd & 0xE0) >> 5; // 1110 0000
    var rr = (cmd & 0x18) >> 3; // 0001 1000
    var mmm = cmd & 0x7; // 0000 0111
    console.log('op', op.toString(2), 'rr', rr.toString(2), 'mmm', mmm.toString(2));
    var arg;
    if ((mmm & 0x4) === 0) {
      console.log('Arg is reg');
      // Arg is reg
      arg = mmm & 0x3; // 0000 0011
    } else {
      if (mmm === 4) {
        console.log('Arg is [B]')
        // Arg is [B]
        arg = this.memory.readMem(this.memory.readReg(1));
      }
      else if (mmm === 5) {
        console.log('Arg is [B + offset]')
        // Arg is [B + offset]
        var offset = this.getNextByte();
        arg = this.memory.readMem(this.memory.readReg(1) + offset);
      }
      else if (mmm === 6) {
        console.log('Arg is [const]')
        // Arg is [const]
        var constant = this.getNextByte();
        arg = this.memory.readMem(constant);
      }
      else if (mmm === 7) {
        console.log('Arg is const')
        // Arg is const
        arg = this.getNextByte();
      }
    }
    
    // Parse op
    switch (op) {
      case 1:
        console.log('OR')
        // OR
        this.memory.writeReg(
          rr,
          this.memory.readReg(rr) | arg
        );
        break;
      case 2:
        console.log('AND')
        // AND
        this.memory.writeReg(
          rr,
          this.memory.readReg(rr) & arg
        );
        break;
      case 3:
        console.log('CMP')
        // CMP
        // var regCont = this.memory.readReg(rr);
        break;
      case 4:
        console.log('SUB')
        // SUB
        this.memory.writeReg(
          rr,
          this.memory.readReg(rr) - arg
        );
        break;
      case 5:
        console.log('ADD')
        // ADD
        this.memory.writeReg(
          rr,
          this.memory.readReg(rr) + arg
        );
        break;
      case 6:
        console.log('MOV reg, arg', rr, arg)
        // MOV reg, arg
        this.memory.writeReg(rr, arg);
        break;
      case 7:
        console.log('MOV arg, reg', rr, arg)
        // MOV arg, reg
        this.memory.writeMem(arg, this.memory.readReg(rr));
        break;
      default:
        throw new Error('Unknown sub-opcode:' + op);
    }
    return;
  } else {
    // Prefixed 000
    var op = (cmd & 0x18) >> 3; // 1110 0000
    var mmm = cmd & 0x7; // 0000 0111
    console.log('op', op.toString(2), 'mmm', mmm.toString(2));
    switch (op) {
      case 1:
        console.log('JMP', mmm)
        // MOV reg, arg
        break;
      case 2:
        console.log('NEG', mmm);
        // NEG
        if ((mmm & 0x4) === 0) {
          console.log('Arg is reg');
          // Arg is reg
          var reg = mmm & 0x3; // 0000 0011
          this.memory.writeReg(reg,
            ~this.memory.readReg(reg)
          )
        } else {
          console.log('not zero?');
          if (mmm === 4) {
            console.log('Arg is [B]')
            // Arg is [B]
            var arg = this.memory.readMem(this.memory.readReg(1));
            this.memory.writeMem(this.memory.readReg(1), ~arg);
          }
          else if (mmm === 5) {
            console.log('Arg is [B + offset]')
            // Arg is [B + offset]
            var offset = this.getNextByte();
            var arg = this.memory.readMem(this.memory.readReg(1) + offset);
            this.memory.writeMem(this.memory.readReg(1) + offset, ~arg);
          }
          else if (mmm === 6) {
            console.log('Arg is [const]')
            // Arg is [const]
            var constant = this.getNextByte();
            var arg = this.memory.readMem(constant);
            this.memory.writeMem(constant, ~arg);
          }
          else if (mmm === 7) {
            console.log('Arg is const')
            throw new Error('Invalid NOT operation');
          }
        }
        break;    
      default:
        throw new Error('Unknown sub-opcode:', op);
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
  while (!this.halted) {
    this.step();
    // this.clock = setInterval(function () {
    //   this.step();
    // }.bind(this), 1000);
  }
};

CPU.prototype.halt = function () {
  console.log('HALTED');
  this.halted = true;
  clearInterval(this.clock);
  this.clock = null;
};

module.exports = CPU;
