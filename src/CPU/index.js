var Memory = require('../Memory');
var Screen = require('../Screen');

var log = function () {
  var debug = true;
  if (debug) {
    console.log.apply(this, arguments);
  }
};

/*
Opcode design:
- http://www.c-jump.com/CIS77/CPU/IsaDesign/lecture.html
Jumps:
- http://unixwiz.net/techtips/x86-jumps.html
On how the flags are set:
- http://teaching.idallen.com/dat2343/10f/notes/040_overflow.txt
*/

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

CPU.prototype.setFlag = function(flag, testCond) {
  if (testCond) {
    this.memory.setFlag(flag);
  } else {
    this.memory.resetFlag(flag);
  }
};

CPU.prototype.step = function () {
  log('===== address:', this.PC.toString(16), '=====');
  var cmd = this.getNextByte();
  log(cmd.toString(2));
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
    log('op', op.toString(2), 'rr', rr.toString(2), 'mmm', mmm.toString(2));
    var arg;
    if (mmm & 0x4 === 0) {
      log('Arg is reg');
      // Arg is reg
      arg = mmm & 0x3; // 0000 0011
    } else {
      if (mmm === 4) {
        log('Arg is [B]')
        // Arg is [B]
        arg = this.memory.readMem(this.memory.readReg(1));
      }
      else if (mmm === 5) {
        log('Arg is [B + offset]')
        // Arg is [B + offset]
        var offset = this.getNextByte();
        arg = this.memory.readMem(this.memory.readReg(1) + offset);
      }
      else if (mmm === 6) {
        log('Arg is [const]')
        // Arg is [const]
        var constant = this.getNextByte();
        arg = this.memory.readMem(constant);
      }
      else if (mmm === 7) {
        log('Arg is const')
        // Arg is const
        arg = this.getNextByte();
      }
    }
    
    // Parse op
    switch (op) {
      case 1:
        log('OR')
        // OR
        var r = this.memory.writeReg(
          rr,
          this.memory.readReg(rr) | arg
        );
        this.setFlag('ZERO', (r === 0));
        this.setFlag('PARITY', (r & 0x1) === 1);
        break;
      case 2:
        log('AND')
        // AND
        var r = this.memory.writeReg(
          rr,
          this.memory.readReg(rr) & arg
        );
        this.setFlag('ZERO', (r === 0));
        this.setFlag('PARITY', (r & 0x1) === 1);
        break;
      case 3:
        log('CMP')
        // CMP
        var regCont = this.memory.readReg(rr);
        var res = regCont - arg;
        this.setFlag('ZERO', (res === 0));
        this.setFlag('SIGN', (res >> 7));
        this.setFlag('PARITY', (res & 0x1) === 1);
        if (res > 255) {
          this.setFlag('CARRY', true);
          res = 0xFF;
        } else {
          this.setFlag('CARRY', false);
        }
        if (((regCont & 0x80) === (arg & 0x80)) && (res & 0x80) !== (regCont & 0x80)) {
          this.setFlag('OVERFLOW', true);
        } else {
          this.setFlag('OVERFLOW', false);
        }
        break;
      case 4:
        log('SUB')
        // SUB
        var opA = this.memory.readReg(rr);
        var res = opA - arg;
        if (res > 255) {
          this.setFlag('CARRY', true);
          res = 0xFF;
        } else {
          this.setFlag('CARRY', false);
        }
        var r = this.memory.writeReg(rr, res);
        this.setFlag('ZERO', (r === 0));
        this.setFlag('SIGN', (r >> 7));
        this.setFlag('PARITY', (r & 0x1) === 1);
        if (((opA & 0x80) === (arg & 0x80)) && (r & 0x80) !== (opA & 0x80)) {
          this.setFlag('OVERFLOW', true);
        } else {
          this.setFlag('OVERFLOW', false);
        }
        break;
      case 5:
        log('ADD', rr, arg)
        // ADD
        var opA = this.memory.readReg(rr);
        var res = opA + arg;
        if (res > 255) {
          this.setFlag('CARRY', true);
          res = 0xFF;
        } else {
          this.setFlag('CARRY', false);
        }
        this.memory.writeReg(rr, res);
        this.setFlag('ZERO', (r === 0));
        this.setFlag('SIGN', (r >> 7));
        this.setFlag('PARITY', (r & 0x1) === 1);
        if (((opA & 0x80) === (arg & 0x80)) && (r & 0x80) !== (opA & 0x80)) {
          this.setFlag('OVERFLOW', true);
        } else {
          this.setFlag('OVERFLOW', false);
        }
        break;
      case 6:
        log('MOV reg, arg', rr, arg)
        // MOV reg, arg
        this.memory.writeReg(rr, arg);
        break;
      case 7:
        log('MOV arg, reg', rr, arg)
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
    log('op', op.toString(2), 'mmm', mmm.toString(2));
    switch (op) {
      case 1:
        // JMP
        var addr = this.getNextByte();
        log('JMP');
        if (mmm === 0) {
          // JE
          log('JE', addr);
          if (this.memory.getFlag('ZERO')) {
            this.PC = addr;
          }
          return;
        }
        else if (mmm === 1) {
          // JNE
          log('JNE', addr);
          if (!this.memory.getFlag('ZERO')) {
            this.PC = addr;
          }
          return;
        }
        else if (mmm === 2) {
          // JL
          log('JL', addr);
          if (this.memory.getFlag('SIGN') !== this.memory.getFlag('OVERFLOW')) {
            this.PC = addr;
          }
          return;
        }
        else if (mmm === 3) {
          // JLE
          log('JLE', addr);
          if (!this.memory.getFlag('CARRY') || this.memory.getFlag('ZERO')) {
            this.PC = addr;
          }
          return;
        }
        else if (mmm === 4) {
          // JG
          log('JG', addr);
          if (!this.memory.getFlag('ZERO') && (this.memory.getFlag('SIGN') === this.memory.getFlag('OVERFLOW'))) {
            this.PC = addr;
          }
          return;
        }
        else if (mmm === 5) {
          // JGE
          log('JGE', addr);
          if (this.memory.getFlag('SIGN') === this.memory.getFlag('OVERFLOW')) {
            this.PC = addr;
          }
          return;
        }
        else if (mmm === 6) {
          // JMP
          log('JMP', addr);
          this.PC = addr;
          return;
        }
        else {
          throw new Error('Unknown jump');
        }
        break;
      case 2:
        log('NEG', mmm);
        // NEG
        if (mmm & 0x4 === 0) {
          log('Arg is reg');
          // Arg is reg
          var reg = mmm & 0x3; // 0000 0011
          this.memory.writeReg(reg,
            ~this.memory.readReg(reg)
          )
        } else {
          log('not zero?');
          if (mmm === 4) {
            log('Arg is [B]')
            // Arg is [B]
            var arg = this.memory.readMem(this.memory.readReg(1));
            this.memory.writeMem(this.memory.readReg(1), ~arg);
          }
          else if (mmm === 5) {
            log('Arg is [B + offset]')
            // Arg is [B + offset]
            var offset = this.getNextByte();
            var arg = this.memory.readMem(this.memory.readReg(1) + offset);
            this.memory.writeMem(this.memory.readReg(1) + offset, ~arg);
          }
          else if (mmm === 6) {
            log('Arg is [const]')
            // Arg is [const]
            var constant = this.getNextByte();
            var arg = this.memory.readMem(constant);
            this.memory.writeMem(constant, ~arg);
          }
          else if (mmm === 7) {
            log('Arg is const')
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
  log('Default', cmd);
  this.PC++;
  return;
};

CPU.prototype.run = function () {
  this.halted = false;
  
  this.clock = setInterval(function () {
    this.step();
  }.bind(this), 1000);
  // while (!this.halted) {
  //   this.step();
  // }
};

CPU.prototype.halt = function () {
  log('HALTED');
  this.halted = true;
  clearInterval(this.clock);
  this.clock = null;
};

module.exports = CPU;
