(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Clock = function (speed) {
  this.events = {};
  this.speed = speed;
  this.timer = null;
};

Clock.prototype.on = function (event, callback) {
  if (this.events[event]) {
    this.events[event].push(callback);
  } else {
    this.events[event] = [callback];
  }
};

Clock.prototype.trigger = function (event, data) {
  if (this.events[event]) {
    for (var i = 0; i < this.events[event].length; i++) {
      var stopPropagation = false,
        fnStopPropagation = function () { stopPropagation = true; };
      this.events[event][i](data, fnStopPropagation);
      if (stopPropagation) break;
    }
  }
};

Clock.prototype.tick = function () {
  this.trigger('tick');
};

Clock.prototype.start = function () {
  this.timer = setInterval(this.tick.bind(this), this.speed);
  this.trigger('start');
};

Clock.prototype.stop = function () {
  clearInterval(this.timer);
  this.timer = null;
  this.trigger('stop');
};

module.exports = Clock;
},{}],2:[function(require,module,exports){
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
  this.clock.on('tick', function () { this.log('Clock'); }.bind(this));
  this.clock.on('start', function () { this.log('Clock started.'); }.bind(this));
  this.clock.on('stop', function () { this.log('Clock stopped.'); }.bind(this));
  
  this.output = options.output;
  this.outputMemory = this.memory.getMap(0xF6E0, 800);
  this.screen = new Screen(this.output, this.outputMemory);
  this.screen.clear();
  this.clock.on('tick', function () { this.screen.render(); }.bind(this));
  
  this.interrupts = {};
  this.devices = [];
  
  this.PC = 0x0000;
  this.SP = this.SBP = 0xF5DF;
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
  this.log('getNextByte');
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
  this.log('==== Step', this.PC);
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
},{"../Memory":5,"../Screen":6,"./Clock":1,"./opcodes":3}],3:[function(require,module,exports){
var opcodes = [
  'HLT',
  'ADD_R_R',
  'ADD_R_RA',
  'ADD_R_A',
  'ADD_R_C',
  'SUB_R_R',
  'SUB_R_RA',
  'SUB_R_A',
  'SUB_R_C',
  'MUL_R_R',
  'MUL_R_RA',
  'MUL_R_A',
  'MUL_R_C',
  'DIV_R_R',
  'DIV_R_RA',
  'DIV_R_A',
  'DIV_R_C',
  'INC_R',
  'DEC_R',
  'AND_R_R',
  'AND_R_RA',
  'AND_R_A',
  'AND_R_C',
  'OR_R_R',
  'OR_R_RA',
  'OR_R_A',
  'OR_R_C',
  'XOR_R_R',
  'XOR_R_RA',
  'XOR_R_A',
  'XOR_R_C',
  'SHL_R_R',
  'SHL_R_RA',
  'SHL_R_A',
  'SHL_R_C',
  'SHR_R_R',
  'SHR_R_RA',
  'SHR_R_A',
  'SHR_R_C',
  'MOV_R_R',
  'MOV_R_RA',
  'MOV_R_A',
  'MOV_R_C',
  'MOV_RA_R',
  'MOV_A_R',
  'MOV_RA_C',
  'MOV_A_C',
  'PUSH_R',
  'PUSH_RA',
  'PUSH_A',
  'PUSH_C',
  'POP_R',
  'JMP_RA',
  'JMP_A',
  'JMP_C',
  'JE_RA',
  'JE_A',
  'JE_C',
  'JNE_RA',
  'JNE_A',
  'JNE_C',
  'JG_RA',
  'JG_A',
  'JG_C',
  'JGE_RA',
  'JGE_A',
  'JGE_C',
  'JL_RA',
  'JL_A',
  'JL_C',
  'JLE_RA',
  'JLE_A',
  'JLE_C',
  'CMP_R_R',
  'CMP_R_RA',
  'CMP_R_A',
  'CMP_R_C',
  'CALL_RA',
  'CALL_A',
  'CALL_C',
  'RET',
  'INT',
  'BRK'
];

module.exports = {
  ops: opcodes.reduce(function (prev, cur, i) {
    var newKey = {};
    newKey[cur] = i;
    return Object.assign({}, prev, newKey);
  }, {}),
  bcs: opcodes
};
},{}],4:[function(require,module,exports){
var Keyboard = function (cpu, device, bufferOffset, bufferLength) {

  var CHARMAP = [
        //  0    1   2   3   4   5   6   7   8   9   A   B   C   D   E   F
  /* 0 */  null,'+','-','*','/','_','.',',',';','>','<','?','!','"','(',')',
  /* 1 */  '0' ,'1','2','3','4','5','6','7','8','9','=',':','[',']','{','}',
  /* 2 */  ' ' ,'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O',
  /* 3 */  'P' ,'Q','R','S','T','U','V','W','X','Y','Z','@','#','$','%','&'
  ];

  
  var buffer = cpu.memory.getMap(bufferOffset, bufferLength);
  
  var kc2charmap = function (k) {
    var char = String.fromCharCode(k).toUpperCase();
    var idx = CHARMAP.findIndex(function (c) { return c === char});
    if (idx < 0) { return 0; } // Error, return null
    return idx;
  };
  
  document.addEventListener('keypress', function (e) {
    // Shift buffer to the right
    buffer.copyWithin(1, 0);
    // Set new byte
    buffer[0x0] = kc2charmap(e.which);
  });
  
  cpu.assignInterrupt(0, function (memory, PC, SP) {
    var cmd = memory.readReg(0x0); // Read A
    switch (cmd) {
      
      // Write current keypress on reg D
      case 0x0:
        memory.writeReg(0x3, buffer[0x0]);
        return cpu.iret();
        
      // Move buffer until NULL into X
      // Length of written chars in D
      // ORed with C
      case 0x1:
        var X = memory.readReg(20);
        var C = memory.readReg(0x2);
        var o = 0;
        while (buffer[o] !== 0x0) {
          memory.writeMem(X + o, buffer[o] | C);
          buffer[o] = 0;
          o++;
        }
        memory.writeReg(3, o);
        return cpu.iret();
        
      // Clean current buffer until NULL.
      // Cleaned up bytes in D
      case 0x2:
        var o = 0;
        while (buffer[o] !== 0x0) {
          buffer[o] = 0;
          o++;
        }
        memory.writeReg(3, o);
        return cpu.iret();
        
      // Copy a byte from buffer[B] to X
      // ORed with C
      case 0x3:
        var X = memory.readReg(20);
        var B = memory.readReg(0x1);
        var C = memory.readReg(0x2);
        var char = buffer[B];
        memory.writeMem(X, (char | C));
        return cpu.iret();
        
      // Force buffer shift to the right
      case 0x4:
        buffer.copyWithin(1, 0);
        buffer[0x0] = 0;
        return cpu.iret();
        
      // Force buffer shift to the left
      case 0x5:
        buffer.copyWithin(0, 1);
        return cpu.iret();

      default:
        throw new Error('Unknown INT code ' + cmd);
    }
  });
  
};

module.exports = Keyboard;
},{}],5:[function(require,module,exports){
var Memory = function () {
  this._raw = new ArrayBuffer(64000);
  this.mem = new Uint8Array(this._raw, 0);
  this._registers = new ArrayBuffer(8);
  this.regs8 = new Uint8Array(this._registers, 0);
  this.regs16 = new Uint16Array(this._registers, 4);
};

Memory.prototype.writeReg = function (reg, value) {
  if (reg > 0xF) {
    var regNum = Math.floor(((reg & 0xF) / 2) - 2);
    return this.writeReg16(regNum, value);
  }
  return this.writeReg8(reg, value);
};

Memory.prototype.readReg = function (reg) {
  if (reg > 0xF) {
    var regNum = Math.floor(((reg & 0xF) / 2) - 2);
    return this.readReg16(regNum);
  }
  return this.readReg8(reg);
};

Memory.prototype.writeReg8 = function (reg, value) {
  if (reg > this.regs8.length) throw new Error('Invalid register');
  return this.regs8[reg] = value;
};

Memory.prototype.readReg8 = function (reg) {
  if (reg >= this.regs8.length) throw new Error('Invalid register');
  return this.regs8[reg];
};

Memory.prototype.writeReg16 = function (reg, value) {
  if (reg > this.regs16.length) throw new Error('Invalid register');
  return this.regs16[reg] = value;
};

Memory.prototype.readReg16 = function (reg) {
  if (reg >= this.regs16.length) throw new Error('Invalid register');
  return this.regs16[reg]
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

module.exports = Memory;

},{}],6:[function(require,module,exports){
var WIDTH = 100,
    HEIGHT = 32,
    COLOR_BLACK = '#000000',
    COLOR_WHITE = '#FFFFFF',
    COLOR_GREEN = '#00AA00',
    COLOR_RED = '#AA0000',
    COLORMAP = [COLOR_BLACK, COLOR_GREEN, COLOR_RED, COLOR_WHITE],
    MODE_TEXT = 0x0;
    
var CHARMAP = [
      //  0    1   2   3   4   5   6   7   8   9   A   B   C   D   E   F
/* 0 */  null,'+','-','*','/','_','.',',',';','>','<','?','!','"','(',')',
/* 1 */  '0' ,'1','2','3','4','5','6','7','8','9','=',':','[',']','{','}',
/* 2 */  ' ' ,'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O',
/* 3 */  'P' ,'Q','R','S','T','U','V','W','X','Y','Z','@','#','$','%','&'
];

var memPerPageByMode = {
  0x0: 80
};

var Screen = function (outputElement, screenMem) {
  this.pxSize = 4;
  this.el = outputElement;
  this.ctx = this.el.getContext('2d');
  this.setupElement();
  this.mem = screenMem;
  this.mode = MODE_TEXT;
  this.memBase = 0;
  this.memPerPage = memPerPageByMode[this.mode];
  this.charmap = CHARMAP;
};

Screen.prototype.setupElement = function () {
  this.el.width = this.realPxToscrPx(WIDTH).toString();
  this.el.height = this.realPxToscrPx(HEIGHT).toString();
  this.clear();
};

Screen.prototype.setMemBase = function (offset) {
  this.memBase = offset;
};

Screen.prototype.realPxToscrPx = function (px) {
  return px * 4;
};

Screen.prototype.scrPxTorealPx = function (px) {
  return Math.floor(px / 4);
};

Screen.prototype.clear = function () {
  this.ctx.fillStyle = COLOR_BLACK;
  this.ctx.fillRect(0, 0, this.realPxToscrPx(WIDTH), this.realPxToscrPx(HEIGHT));
};

Screen.prototype.setMode = function (mode) {
  this.clear();
  this.memBase = 0;
  
  this.mode = mode;
};

Screen.prototype.render = function (noClear) {
  if (!noClear) { this.clear(); }
  switch (this.mode) {
    case MODE_TEXT:
      this.renderText();
      break;
    default:
      throw new Error('Unknown mode ' + this.mode);
  }
}

Screen.prototype.renderText = function () {
  this.ctx.font = this.realPxToscrPx(8) + 'px monospace';
  this.ctx.textBaseline = "top";
  for (var o = 0; o < this.memPerPage; o++) {
    var offset = o + this.memBase,
      cbyte = this.mem[offset],
      status = (cbyte & 0b11000000) >> 6,
      char = (cbyte & 0b00111111),
      str = CHARMAP[char],
      x = o % 20,
      y = Math.floor(o / 20);
    this.ctx.fillStyle = COLORMAP[status];
    this.ctx.fillText(str, this.realPxToscrPx(x) * 5, this.realPxToscrPx(y) * 8, this.realPxToscrPx(5));
  }
};

module.exports = Screen;

},{}],7:[function(require,module,exports){
module.exports = function (memory, PC, SP) {
  var cmd = memory.readReg(0x0); // Read A
  switch (cmd) {
    // console.log
    case 0x0:
      var dataPointer = memory.readReg(20); // Read X
      var char = memory.readMem(dataPointer++); // Read [X]
      var charS = this.screen.charmap[char];
      var str = '';
      var i = 0;
      // Look for null terminator
      while (char !== 0x0 && i < 20) {
        str += charS;
        char = memory.readMem(dataPointer++);
        charS = this.screen.charmap[char];
        i++;
      }
      // Apply function
      console.log(str);
      break;
  }
};
},{}],8:[function(require,module,exports){
var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

var Keyboard = require('./Devices/Keyboard');
// Install keyboard with buffer on 0xF5E1 and 256 bytes of buffer
cpu.installDevice(Keyboard, 0xF5E0, 256);

var sysInts = require('./SysInts');
cpu.assignInterrupt(0x1, sysInts)

var program = new Uint8Array([
  
  // Type in screen
  
  // Screen mem in X / Cursor pos
  42, 4, 0xE0,  // MOV XL, 0xE0
  42, 5, 0xF6,  // MOV XH, 0xF6
  
  // Screen limit in Y
  // off: 6
  42, 6, 0xF7,  // MOV YL, 0xF7
  42, 7, 0x30,  // MOV YH, 0x30
  
  // Add prompt
  // off: 12
  45, 20, 0xC5, // MOV [X], 0xC5
  
  // Check keystrokes
  // off: 15
  42, 0, 0,     // MOV A, 0x0
  81, 0,        // INT 0x0; A=0
  76, 3, 0,     // CMP D, 0 ; No new keys
  57, 15,        // JE 15; Jump to loop
  
  // off: 25
  42, 0, 3,     // MOV A, 0x3 ; Copy keyboard buffer[B] to X, ORed with C
  42, 1, 0,     // MOV B, 0
  42, 2, 0xC0,  // MOV C, 0xC0; OR with white
  81, 0,        // INT 0x0; A=3
  
  // off: 36
  42, 0, 4,     // MOV A, 0x4; Force shift
  81, 0,        // INT 0x0; A=4
  42, 3, 0,     // MOV D, 0x0
  17, 20,       // INC X
  
  // off: 46
  73, 20, 22,   // CMP X, Y
  57, 53,       // JE 53
  54, 72,       // JMP 72
  
  // off: 53
  47, 2,          // PUSH C
  42, 2, 80,      // MOV C, 80; Counter to 80
  42, 0, 5,       // MOV A, 0x5; Force shift left
  81, 0,          // INT 0x0; A=5
  18, 2,          // DEC C
  73, 2, 0,       // CMP C, 0
  60, 59,         // JNE 59
  51, 2,          // POP C
  
  // off: 72
  45, 20, 0xC5, // MOV [X], 0xC5
  54, 15         // JMP 15; Return to main loop

]);

window.cpu = cpu;
cpu.loadProgram(program);

window.addEventListener('keydown', function (e) {
  //console.log(e);
  // Ctrl H to halt
  if (e.ctrlKey && e.which === 72) {
    cpu.halt();
    e.preventDefault();
    return false;
  }
  // Ctrl D to debug
  if (e.ctrlKey && e.which === 68) {
    cpu.toggleDebug();
    console.log('Set debug to:', cpu.debug);
    e.preventDefault();
    return false;
  }
  if (e.shiftKey && e.which === 107) {
    cpu.clock.speed += 10;
    console.log('Set speed to', cpu.clock.speed);
    e.preventDefault();
    return false;
  }
  if (e.shiftKey && e.which === 109) {
    cpu.clock.speed -= 10;
    console.log('Set speed to', cpu.clock.speed);
    e.preventDefault();
    return false;
  }
  if (e.shiftKey && e.which === 106) {
    cpu.clock.speed = parseInt(prompt('Set new clock speed:', '1000'), 10);
    console.log('Set speed to', cpu.clock.speed);
    e.preventDefault();
    return false;
  }
});

cpu.run();

},{"./CPU":2,"./Devices/Keyboard":4,"./SysInts":7}]},{},[8]);
