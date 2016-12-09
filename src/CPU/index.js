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
  this.flags = {
    carry: false,
    parity: false,
    zero: false,
    sign: false,
    overflow: false
  };
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
      
      case 'INC':
        var reg = this.getNextByte();
        var regCont = this.memory.readReg(reg);
        var res = regCont + 1;
        res = this.setFlagsMath(regCont, 1, res);
        log('INC', reg, '=', res);
        this.memory.writeReg(reg, res);
        break;
        
      case 'DEC':
        var reg = this.getNextByte();
        var regCont = this.memory.readReg(reg);
        var res = regCont - 1;
        res = this.setFlagsMath(regCont, 1, res);
        log('DEC', reg, '=', res);
        this.memory.writeReg(reg, res);
        break;
        
      case 'ADD':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont + arg2;
        log('ADD', regA, regCont, '+', arg2, '=', res);
        res = this.setFlagsMath(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'SUB':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont - arg2;
        log('SUB', regA, regCont, '-', arg2, '=', res);
        res = this.setFlagsMath(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
      
      case 'MUL':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont * arg2;
        log('MUL', regA, regCont, '*', arg2, '=', res);
        res = this.setFlagsMath(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'DIV':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = Math.round(regCont / arg2);
        log('DIV', regA, regCont, '/', arg2, '=', res);
        res = this.setFlagsMath(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'CMP':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont - arg2;
        log('CMP', regA, regCont, '?', arg2, '=', res);
        res = this.setFlagsMath(regCont, arg2, res);
        break;
        
      case 'AND':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont & arg2;
        log('AND', regA, regCont, '&', arg2, '=', res);
        res = this.setFlagsBit(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'OR':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont | arg2;
        log('OR', regA, regCont, '|', arg2, '=', res);
        res = this.setFlagsBit(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
      
      case 'XOR':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = regCont ^ arg2;
        log('XOR', regA, regCont, '^', arg2, '=', res);
        res = this.setFlagsBit(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'SHL':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = (regCont << arg2) & 0xFF;
        log('SHL', regA, regCont, '<<', arg2, '=', res);
        res = this.setFlagsBit(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'SHR':
        // Get first arg
        var regA = this.getNextByte();
        var regCont = this.memory.readReg(regA);
        var arg2 = this.getNextArgValue(parsed.arg2type);
        var res = (regCont >> arg2) && 0xFF;
        log('SHR', regA, regCont, '>>', arg2, '=', res);
        res = this.setFlagsBit(regCont, arg2, res);
        this.memory.writeReg(regA, res);
        break;
        
      case 'PUSH':
        var arg = this.getNextArgValue(parsed.arg1type);
        log('PUSH', this.SP, '<-', arg);
        this.memory.writeMem(this.SP--, arg);
        break;
        
      case 'POP':
        var reg = this.getNextByte();
        var val = this.memory.readMem(++this.SP);
        log('POP', this.SP-1, '->', reg);
        this.memory.writeReg(reg, val);
        break;
        
      case 'MOV':
        if (parsed.arg1type === 'R') {
          var reg = this.getNextByte();
          var val = this.getNextArgValue(parsed.arg2type);
          log('MOV', 'reg', reg, '<-', val);
          this.memory.writeReg(reg, val);
        } else if (parsed.arg1type === 'RA') {
          var reg = this.getNextByte();
          var addr = this.memory.readReg(reg);
          var val = this.getNextArgValue(parsed.arg2type);
          log('MOV', '[reg]=', addr, '<-', val);
          this.memory.writeMem(addr, val);
        } else if (parsed.arg1type === 'A') {
          var addr = this.getNextArgValue('A');
          var val = this.getNextArgValue(parsed.arg2type);
          log('MOV', 'addr', addr, '<-', val);
          this.memory.writeMem(addr, val);
        }
        break;
        
      case 'JMP':
        var addr = this.getNextArgValue(parsed.arg1type);
        this.PC = addr;
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
  if (res > 255) {
    this.flags.carry = true;
    res = res && 0xFF;
  } else {
    this.flags.carry = false;
  }
  log('FLAGS:', this.flags);
  return res
};

CPU.prototype.setFlagsBit = function (A, B, res) {
  this.flags.zero = (res === 0);
  this.flags.sign = (res >> 7) > 0;
  this.flags.parity = (res & 0x1);
  log('FLAGS:', this.flags);
};

module.exports = CPU;