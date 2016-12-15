var opcodes = require('./opcodes');
var Memory = require('../Memory');
var Screen = require('../Screen');
var Clock = require('./Clock');

/*
Jumps:
- http://unixwiz.net/techtips/x86-jumps.html
On how the flags are set:
- http://teaching.idallen.com/dat2343/10f/notes/040_overflow.txt
*/

var CPU = function (options) {
  this.debug = true;
  
  this.memory = new Memory();
  window.memory = this.memory;
  
  this.clock = new Clock(10);
  this.clock.on('tick', this.step.bind(this));
  this.clock.on('tick', function () { this.log('Tick'); }.bind(this));
  this.clock.on('start', function () { this.log('Clock started.'); }.bind(this));
  this.clock.on('stop', function () { this.log('Clock stopped.'); }.bind(this));
  
  if (options.output) {
    this.output = options.output;
    this.outputMemory = this.memory.getMap(0xF6E0, 800);
    this.screen = new Screen(this.output, this.outputMemory);
    this.screen.clear();
    this.clock.on('tick', function () { this.screen.render(); }.bind(this));
  }
  
  this.interrupts = {};
  this.devices = [];
  
  this.PC = (options.startAt !== undefined && options.startAt < 0xFFFF) ? options.startAt : 0x0000;
  this.SP = this.SBP = (options.stackAddr !== undefined && options.stackAddr < 0xFFFF) ? options.stackAddr : 0xF5DF;
  this.flags = {
    carry: false,
    parity: false,
    zero: false,
    sign: false,
    overflow: false
  };
  this.halted = true;
};

CPU.prototype.toggleDebug = function () {
  this.debug = !this.debug;
};

CPU.prototype.log = function () {
  if (this.debug) {
    var args = Array.prototype.slice.call(arguments);
    console.log(args.map(function (e) { return (typeof e === 'string') ? e : JSON.stringify(e) }).join("\t"));
  }
};

CPU.prototype.assignInterrupt = function (iden, interrupt) {
  this.interrupts[iden] = interrupt;
};

CPU.prototype.callInterrupt = function (iden) {
  this.clock.stop();
  this.halted = true;
  this.interrupts[iden].call(this, this.memory, this.PC, this.SP);
};

CPU.prototype.installDevice = function (device) {
  this.devices.push(device);
  var args = [this].concat(Array.prototype.slice.call(arguments));
  device.apply(this, args);
};

CPU.prototype.iret = function () {
  this.clock.start();
  this.halted = false;
};

CPU.prototype.loadProgram = function (prog, offset) {
  offset = offset || 0;
  for (var o = 0; o < prog.length; o++) {
    var oo = offset + o;
    this.memory.writeMem(oo, prog[o]);
  }
};

CPU.prototype.getNextByte = function () {
  this.log('> getNextByte');
  return this.memory.readMem(this.PC++);
};

CPU.prototype.halt = function () {
  this.clock.stop();
  this.halted = true;
};

CPU.prototype.run = function () {
  this.halted = false;
  this.clock.start();
};

CPU.prototype.step = function () {
  this.log('===== ADDR:', '0x'+this.PC.toString(16).lpad(4), '=====');
  if (this.halted) return;
  try {
    var bc = this.getNextByte();
    var parsed = this.parseBytecode(bc);
    this.log(parsed);
    switch (parsed.cmd) {
      case 'HLT':
        this.halt();
        break;
      
      case 'INC':
        var reg = this.getNextByte();
        var regCont = this.memory.readReg(reg);
        var res = regCont + 1;
        if (reg <= 0xF) {
          res = this.setFlagsMath(regCont, 1, res);  
        } else {
          res = this.setFlagsMath16(regCont, 1, res);  
        }
        this.log('INC', reg, '=', res);
        this.memory.writeReg(reg, res);
        break;
        
      case 'DEC':
        var reg = this.getNextByte();
        var regCont = this.memory.readReg(reg);
        var res = regCont - 1;
        if (reg <= 0xF) {
          res = this.setFlagsMath(regCont, 1, res);  
        } else {
          res = this.setFlagsMath16(regCont, 1, res);  
        }
        this.log('DEC', reg, '=', res);
        this.memory.writeReg(reg, res);
        break;
        
      case 'ADD':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont + arg2;
        this.log('ADD', regA, regCont, '+', arg2, '=', res);
        res = this.setFlagsMath(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'SUB':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont - arg2;
        this.log('SUB', regA, regCont, '-', arg2, '=', res);
        res = this.setFlagsMath(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
      
      case 'MUL':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont * arg2;
        this.log('MUL', regA, regCont, '*', arg2, '=', res);
        res = this.setFlagsMath(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'DIV':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = Math.round(regCont / arg2);
        this.log('DIV', regA, regCont, '/', arg2, '=', res);
        res = this.setFlagsMath(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'CMP':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont - arg2;
        this.log('CMP', regA, regCont, '?', arg2, '=', res);
        res = this.setFlagsMath(regCont, arg2, res);
        break;
        
      case 'AND':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont & arg2;
        this.log('AND', regA, regCont, '&', arg2, '=', res);
        res = this.setFlagsBit(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'OR':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont | arg2;
        this.log('OR', regA, regCont, '|', arg2, '=', res);
        res = this.setFlagsBit(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
      
      case 'XOR':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont ^ arg2;
        this.log('XOR', regA, regCont, '^', arg2, '=', res);
        res = this.setFlagsBit(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'SHL':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = (regCont << arg2) & 0xFF;
        this.log('SHL', regA, regCont, '<<', arg2, '=', res);
        res = this.setFlagsBit(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'SHR':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = (regCont >> arg2) && 0xFF;
        this.log('SHR', regA, regCont, '>>', arg2, '=', res);
        res = this.setFlagsBit(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'PUSH':
        var arg = this.getNextArgValue(parsed.arg1type);
        this.log('PUSH', this.SP, '<-', arg);
        this.memory.writeMem(this.SP--, arg);
        break;
        
      case 'POP':
        var reg = this.getNextByte();
        var val = this.memory.readMem(++this.SP);
        this.log('POP', this.SP-1, '->', reg);
        this.memory.writeReg(reg, val);
        break;
        
      case 'MOV':
        if (parsed.arg1type === 'R') {
          var reg = this.getNextByte();
          var val = this.getNextArgValue(parsed.arg2type);
          this.log('MOV', 'reg', reg, '<-', val);
          this.memory.writeReg(reg, val);
        } else if (parsed.arg1type === 'RA') {
          var reg = this.getNextByte();
          var addr = this.memory.readReg(reg);
          var val = this.getNextArgValue(parsed.arg2type);
          this.log('MOV', '[reg]=', addr, '<-', val);
          this.memory.writeMem(addr, val);
        } else if (parsed.arg1type === 'A') {
          var addr = this.getNextArgValue('A');
          var val = this.getNextArgValue(parsed.arg2type);
          this.log('MOV', 'addr', addr, '<-', val);
          this.memory.writeMem(addr, val);
        }
        break;
        
      case 'JMP':
        var addr = this.getNextArgValue(parsed.arg1type);
        this.PC = addr;
        break;
        
      case 'JE':
        var addr = this.getNextArgValue(parsed.arg1type);
        if (this.flags.zero) {
          this.PC = addr;
        }
        break;
        
      case 'JNE':
        var addr = this.getNextArgValue(parsed.arg1type);
        if (!this.flags.zero) {
          this.PC = addr;
        }
        break;
        
      case 'JG':
        var addr = this.getNextArgValue(parsed.arg1type);
        if (this.flags.sign !== this.flags.overflow) {
          this.PC = addr;
        }
        break;
        
      case 'JGE':
        var addr = this.getNextArgValue(parsed.arg1type);
        if (this.flags.carry || this.flags.zero) {
          this.PC = addr;
        }
        break;
        
      case 'JL':
        var addr = this.getNextArgValue(parsed.arg1type);
        if (!this.flags.zero && (this.flags.sign === this.flags.overflow)) {
          this.PC = addr;
        }
        break;
        
      case 'JLE':
        var addr = this.getNextArgValue(parsed.arg1type);
        if (this.flags.sign === this.flags.overflow) {
          this.PC = addr;
        }
        break;
        
      case 'CALL':
        var addr = this.getNextArgValue(parsed.arg1type);
        this.memory.writeMem(this.SP--, this.PC);
        this.PC = addr;
        break;
        
      case 'RET':
        var addr = this.memory.readMem(++this.SP);
        this.PC = addr;
        break;
        
      case 'INT':
        var interrupt = this.getNextByte();
        this.callInterrupt(interrupt);
        break;
        
      case 'BRK':
        this.halt();
        this.log('Break at', this.PC.toString(16));
        this.log('Registers', this.memory.regs8, this.memory.regs16);
        break;
        
      default:
        this.log('Not implemented yet:' + parsed.cmd);
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

CPU.prototype.getNextArgValue = function (argtype) {
  if (argtype === 'R') {
    var reg = this.getNextByte();
    return this.memory.readReg(reg);
  } else if (argtype === 'RA') {
    var reg = this.getNextByte();
    return this.memory.readMem(this.memory.readReg(reg));
  } else if (argtype === 'A') {
    var addr1 = this.getNextByte(), addr2 = this.getNextByte(), addr = (addr1 << 8) + addr2;
    return this.memory.readMem(addr);
  } else if (argtype === 'C') {
    return this.getNextByte();
  }
};

CPU.prototype.setFlagsMath = function (A, B, res) {
  this.flags.zero = (res === 0);
  this.flags.sign = (res >> 7) > 0;
  this.flags.parity = !!(res & 0x1);
  this.flags.overflow = ((A & 0x80) === (B & 0x80)) && (res & 0x80) !== (A & 0x80);
  if (res > 255 || res < 0) {
    this.flags.carry = true;
    res = res && 0xFF;
  } else {
    this.flags.carry = false;
  }
  this.log('FLAGS:', this.flags);
  return res;
};

CPU.prototype.setFlagsMath16 = function (A, B, res) {
  this.flags.zero = (res === 0);
  this.flags.sign = (res >> 7) > 0;
  this.flags.parity = !!(res & 0x1);
  this.flags.overflow = ((A & 0x8000) === (B & 0x8000)) && (res & 0x8000) !== (A & 0x8000);
  if (res > 0xFFFF || res < 0) {
    this.flags.carry = true;
    res = res && 0xFFFF;
  } else {
    this.flags.carry = false;
  }
  this.log('FLAGS:', this.flags);
  return res;
};

CPU.prototype.setFlagsBit = function (A, B, res) {
  this.flags.zero = (res === 0);
  this.flags.sign = (res >> 7) > 0;
  this.flags.parity = (res & 0x1);
  this.log('FLAGS:', this.flags);
  return res;
};

module.exports = CPU;