(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var opcodes = require('./opcodes');
var Memory = require('../Memory');
var Screen = require('../Screen');
var Clock = require('../Clock');

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
  this.flags = {
    carry: false,
    parity: false,
    zero: false,
    sign: false,
    overflow: false
  };
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

CPU.prototype.reset = function () {
  this.PC = 0;
  this.SP = this.SBP;
  this.memory.clean();
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
          var addrInAddr = this.memory.readMem(addr);
          var val = this.getNextArgValue(parsed.arg2type);
          this.log('MOV', '[addr]', addrInAddr, '<-', val);
          this.memory.writeMem(addrInAddr, val);
        } else if (parsed.arg1type === 'CA') {
          var addr = this.getNextArgValue('CA');
          val = this.getNextArgValue(parsed.arg2type);
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
  } else if (argtype === 'CA') {
    var addr1 = this.getNextByte(), addr2 = this.getNextByte(), addr = (addr1 << 8) + addr2;
    return addr;
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
},{"../Clock":3,"../Memory":6,"../Screen":7,"./opcodes":2}],2:[function(require,module,exports){
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
  'BRK',
  // Added constant address
  'ADD_R_CA',
  'SUB_R_CA',
  'MUL_R_CA',
  'DIV_R_CA',
  'AND_R_CA',
  'OR_R_CA',
  'XOR_R_CA',
  'SHL_R_CA',
  'SHR_R_CA',
  'MOV_R_CA',
  'MOV_CA_R',
  'MOV_CA_C',
  'CMP_R_CA',
  'PUSH_CA',
  'JMP_CA',
  'JE_CA',
  'JNE_CA',
  'JG_CA',
  'JGE_CA',
  'JL_CA',
  'JLE_CA',
  'CALL_CA'
];

module.exports = {
  ops: opcodes.reduce(function (prev, cur, i) {
    var newKey = {};
    newKey[cur] = i;
    return Object.assign({}, prev, newKey);
  }, {}),
  bcs: opcodes
};
},{}],3:[function(require,module,exports){
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
var Clock = require('./Clock');

var MemViewer = function (canvas, buffer, offset) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');
  this.buffer = buffer;
  this.offset = offset;
  this.pxSize = 4;
  this.viewportLength = 1024;
  this.clock = new Clock(500);
  this.clock.on('tick', function () {
    this.render();
  }.bind(this));
};

MemViewer.prototype.getPx = function (val) {
  return val * this.pxSize;
};

MemViewer.prototype.render = function () {
  var len = (this.offset + this.viewportLength > this.buffer.byteLength) ? undefined : this.viewportLength;
  var data = new Uint8Array(this.buffer, this.offset, len);
  var vpw = Math.floor(this.canvas.width / 4);
  for (var o = 0; o < this.viewportLength; o++) {
    var x = o % vpw, y = Math.floor(o / vpw);
    var d = data[o], c = d.toString(16), ccc = c+c+c;
    this.ctx.fillStyle = '#' + ccc;
    this.ctx.fillRect(this.getPx(x), this.getPx(y), this.getPx(1), this.getPx(1));
  }
};

MemViewer.prototype.start = function () {
  this.clock.start();
};
MemViewer.prototype.stop = function () {
  this.clock.stop();
};

module.exports = MemViewer;
},{"./Clock":3}],6:[function(require,module,exports){
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

Memory.prototype.clean = function () {
  for (var i = 0; i < this._raw.length; i++) {
    this.writeMem(i, 0);
  }
  this.writeReg(0,0);
  this.writeReg(1,0);
  this.writeReg(2,0);
  this.writeReg(3,0);
  this.writeReg(4,0);
  this.writeReg(5,0);
  this.writeReg(6,0);
  this.writeReg(7,0);
};

module.exports = Memory;

},{}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
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
},{}],9:[function(require,module,exports){
var parser = require('./parser');

var CHARMAP = [
        //  0    1   2   3   4   5   6   7   8   9   A   B   C   D   E   F
  /* 0 */  null,'+','-','*','/','_','.',',',';','>','<','?','!','"','(',')',
  /* 1 */  '0' ,'1','2','3','4','5','6','7','8','9','=',':','[',']','{','}',
  /* 2 */  ' ' ,'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O',
  /* 3 */  'P' ,'Q','R','S','T','U','V','W','X','Y','Z','@','#','$','%','&'
  ];

function compile (code) {
  var prog = code.replace(/;[^\n\r]+/g, ''); // Remove comments
  prog = prog.replace(/^[\n\r]/gm, ''); // Remove empty lines
  prog = prog.replace(/(?:^)[ \t]+|[ \t]+(?=$)/gm, ''); // Trim
  
  var labels = {};
  var bytecode = [];
  
  try {
    var comp = parser.parse(prog);
    for (var i = 0; i < comp.length; i++) {
      var label = comp[i].label,
          instr = comp[i].instr;
      if (label !== null) {
        labels[label] = bytecode.length;
      }
      if (instr.opcode < 0) {
        // Compiler op
        switch (instr.mnem) {
          case 'DB':
            if (typeof instr.args === 'string') {
              for (var s = 0; s < instr.args.length; s++) {
                var c = instr.args.charAt(s).toUpperCase(),
                    cb = CHARMAP.indexOf(c);
                if (cb > -1) {
                  bytecode.push(cb);
                }
              }
            } else {
              bytecode.push(instr.args);
            }
            break;
          case 'DUP':
            // Not implemented yet
            break;
        }
      } else {
        bytecode.push(instr.opcode);
        var types = instr.mnem.match(/(?:_)[A-Z]+/g);
        var args = Array.isArray(instr.args) ? instr.args : [instr.args];
        for (var j = 0; j < args.length; j++) {
          if (args[j] === null) { break; }
          pushArg(types[j], args[j], bytecode);
        }
      }
    }
    
    // Replace labels
    for (var b = 0; b < bytecode.length; b++) {
      var cb = bytecode[b];
      if (typeof cb === 'string') {
        var addr = labels[cb],
          addr1 = (addr & 0xFF00) >> 8, addr2 = (addr & 0xFF);
        bytecode[b] = addr1;
        bytecode[b+1] = addr2;
        b++;
      }
    }
  } catch (e) {
    console.error(e);
  }
  
  return {
    bytecode: Uint8Array.from(bytecode),
    array: bytecode,
    labels: labels
  };
}

function pushArg(type, value, bc) {
  switch (type) {
    case '_R':
    case '_RA':
      bc.push(value);
      break;
    case '_A':
    case '_CA':
      if (typeof value === 'string') {
        bc.push(value);
        bc.push(value);
      } else {
        var v1 = (value & 0xFF00) >> 8, v2 = (value & 0xFF);
        bc.push(v1);
        bc.push(v2);
      }
      break;
    case '_C':
      bc.push(value);
      break;
  }
}

module.exports = compile;
},{"./parser":10}],10:[function(require,module,exports){
/*
 * Generated by PEG.js 0.10.0.
 *
 * http://pegjs.org/
 */

"use strict";

function peg$subclass(child, parent) {
  function ctor() { this.constructor = child; }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor();
}

function peg$SyntaxError(message, expected, found, location) {
  this.message  = message;
  this.expected = expected;
  this.found    = found;
  this.location = location;
  this.name     = "SyntaxError";

  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(this, peg$SyntaxError);
  }
}

peg$subclass(peg$SyntaxError, Error);

peg$SyntaxError.buildMessage = function(expected, found) {
  var DESCRIBE_EXPECTATION_FNS = {
        literal: function(expectation) {
          return "\"" + literalEscape(expectation.text) + "\"";
        },

        "class": function(expectation) {
          var escapedParts = "",
              i;

          for (i = 0; i < expectation.parts.length; i++) {
            escapedParts += expectation.parts[i] instanceof Array
              ? classEscape(expectation.parts[i][0]) + "-" + classEscape(expectation.parts[i][1])
              : classEscape(expectation.parts[i]);
          }

          return "[" + (expectation.inverted ? "^" : "") + escapedParts + "]";
        },

        any: function(expectation) {
          return "any character";
        },

        end: function(expectation) {
          return "end of input";
        },

        other: function(expectation) {
          return expectation.description;
        }
      };

  function hex(ch) {
    return ch.charCodeAt(0).toString(16).toUpperCase();
  }

  function literalEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function classEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/\]/g, '\\]')
      .replace(/\^/g, '\\^')
      .replace(/-/g,  '\\-')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function describeExpectation(expectation) {
    return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
  }

  function describeExpected(expected) {
    var descriptions = new Array(expected.length),
        i, j;

    for (i = 0; i < expected.length; i++) {
      descriptions[i] = describeExpectation(expected[i]);
    }

    descriptions.sort();

    if (descriptions.length > 0) {
      for (i = 1, j = 1; i < descriptions.length; i++) {
        if (descriptions[i - 1] !== descriptions[i]) {
          descriptions[j] = descriptions[i];
          j++;
        }
      }
      descriptions.length = j;
    }

    switch (descriptions.length) {
      case 1:
        return descriptions[0];

      case 2:
        return descriptions[0] + " or " + descriptions[1];

      default:
        return descriptions.slice(0, -1).join(", ")
          + ", or "
          + descriptions[descriptions.length - 1];
    }
  }

  function describeFound(found) {
    return found ? "\"" + literalEscape(found) + "\"" : "end of input";
  }

  return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};

function peg$parse(input, options) {
  options = options !== void 0 ? options : {};

  var peg$FAILED = {},

      peg$startRuleFunctions = { Code: peg$parseCode },
      peg$startRuleFunction  = peg$parseCode,

      peg$c0 = peg$otherExpectation("code"),
      peg$c1 = function(h, b) {
          var rest = b.map(function(i){return i[1];});
          return [h].concat(rest);
        },
      peg$c2 = peg$otherExpectation("instruction"),
      peg$c3 = function(l, i) {
          return {
            label: (l) ? l[0] : null,
            instr: i
          }
        },
      peg$c4 = peg$otherExpectation("data instruction"),
      peg$c5 = "DB",
      peg$c6 = peg$literalExpectation("DB", false),
      peg$c7 = function(m, d) { return buildInstr(m, d); },
      peg$c8 = "DUP",
      peg$c9 = peg$literalExpectation("DUP", false),
      peg$c10 = ",",
      peg$c11 = peg$literalExpectation(",", false),
      peg$c12 = function(m, n, d) { return buildInstr(m, [n, d]); },
      peg$c13 = peg$otherExpectation("two argument instruction"),
      peg$c14 = "ADD",
      peg$c15 = peg$literalExpectation("ADD", false),
      peg$c16 = function(m, a1, a2) { return buildInstr(m + "_R_R", [a1, a2]); },
      peg$c17 = function(m, a1, a2) { return buildInstr(m + "_R_RA", [a1, a2]); },
      peg$c18 = function(m, a1, a2) { return buildInstr(m + "_R_A", [a1, a2]); },
      peg$c19 = function(m, a1, a2) { return buildInstr(m + "_R_C", [a1, a2]); },
      peg$c20 = "SUB",
      peg$c21 = peg$literalExpectation("SUB", false),
      peg$c22 = "MUL",
      peg$c23 = peg$literalExpectation("MUL", false),
      peg$c24 = "DIV",
      peg$c25 = peg$literalExpectation("DIV", false),
      peg$c26 = "AND",
      peg$c27 = peg$literalExpectation("AND", false),
      peg$c28 = "OR",
      peg$c29 = peg$literalExpectation("OR", false),
      peg$c30 = "XOR",
      peg$c31 = peg$literalExpectation("XOR", false),
      peg$c32 = "SHL",
      peg$c33 = peg$literalExpectation("SHL", false),
      peg$c34 = "SHR",
      peg$c35 = peg$literalExpectation("SHR", false),
      peg$c36 = "MOV",
      peg$c37 = peg$literalExpectation("MOV", false),
      peg$c38 = function(m, a1, a2) { return buildInstr(m + "_RA_R", [a1, a2]); },
      peg$c39 = function(m, a1, a2) { return buildInstr(m + "_A_R", [a1, a2]); },
      peg$c40 = function(m, a1, a2) { return buildInstr(m + "_RA_C", [a1, a2]); },
      peg$c41 = function(m, a1, a2) { return buildInstr(m + "_A_C", [a1, a2]); },
      peg$c42 = "CMP",
      peg$c43 = peg$literalExpectation("CMP", false),
      peg$c44 = function(m, a1, a2) { return buildInstr(m + "_R_CA", [a1, a2]); },
      peg$c45 = function(m, a1, a2) { return buildInstr(m + "_CA_R", [a1, a2]); },
      peg$c46 = function(m, a1, a2) { return buildInstr(m + "_CA_C", [a1, a2]); },
      peg$c47 = peg$otherExpectation("one argument instruction"),
      peg$c48 = "INC",
      peg$c49 = peg$literalExpectation("INC", false),
      peg$c50 = "DEC",
      peg$c51 = peg$literalExpectation("DEC", false),
      peg$c52 = function(m, a) { return buildInstr(m + '_R', a); },
      peg$c53 = "PUSH",
      peg$c54 = peg$literalExpectation("PUSH", false),
      peg$c55 = function(m, a) { return buildInstr(m + '_RA', a); },
      peg$c56 = function(m, a) { return buildInstr(m + '_A', a); },
      peg$c57 = function(m, a) { return buildInstr(m + '_CA', a); },
      peg$c58 = function(m, a) { return buildInstr(m + '_C', a); },
      peg$c59 = "POP",
      peg$c60 = peg$literalExpectation("POP", false),
      peg$c61 = "JMP",
      peg$c62 = peg$literalExpectation("JMP", false),
      peg$c63 = function(m, a) { return buildInstr(m + "_RA", a); },
      peg$c64 = function(m, a) { return buildInstr(m + "_A", a); },
      peg$c65 = function(m, a) { return buildInstr(m + "_C", a); },
      peg$c66 = "JE",
      peg$c67 = peg$literalExpectation("JE", false),
      peg$c68 = function(m, a) { return buildInstr(m + "_CA", a); },
      peg$c69 = "JNE",
      peg$c70 = peg$literalExpectation("JNE", false),
      peg$c71 = "JG",
      peg$c72 = peg$literalExpectation("JG", false),
      peg$c73 = "JGE",
      peg$c74 = peg$literalExpectation("JGE", false),
      peg$c75 = "JL",
      peg$c76 = peg$literalExpectation("JL", false),
      peg$c77 = "JLE",
      peg$c78 = peg$literalExpectation("JLE", false),
      peg$c79 = "CALL",
      peg$c80 = peg$literalExpectation("CALL", false),
      peg$c81 = "INT",
      peg$c82 = peg$literalExpectation("INT", false),
      peg$c83 = peg$otherExpectation("single instruction"),
      peg$c84 = "HLT",
      peg$c85 = peg$literalExpectation("HLT", false),
      peg$c86 = "RET",
      peg$c87 = peg$literalExpectation("RET", false),
      peg$c88 = "BRK",
      peg$c89 = peg$literalExpectation("BRK", false),
      peg$c90 = function(m) { return buildInstr(m, null); },
      peg$c91 = peg$otherExpectation("label address"),
      peg$c92 = "[",
      peg$c93 = peg$literalExpectation("[", false),
      peg$c94 = "]",
      peg$c95 = peg$literalExpectation("]", false),
      peg$c96 = function(a) { return a; },
      peg$c97 = peg$otherExpectation("address"),
      peg$c98 = peg$otherExpectation("register address"),
      peg$c99 = peg$otherExpectation("register"),
      peg$c100 = /^[A-D]/,
      peg$c101 = peg$classExpectation([["A", "D"]], false, false),
      peg$c102 = function() { return regs[text()]; },
      peg$c103 = /^[XY]/,
      peg$c104 = peg$classExpectation(["X", "Y"], false, false),
      peg$c105 = /^[HL]/,
      peg$c106 = peg$classExpectation(["H", "L"], false, false),
      peg$c107 = peg$otherExpectation("label reference"),
      peg$c108 = /^[a-zA-Z._]/,
      peg$c109 = peg$classExpectation([["a", "z"], ["A", "Z"], ".", "_"], false, false),
      peg$c110 = /^[a-zA-Z0-9._]/,
      peg$c111 = peg$classExpectation([["a", "z"], ["A", "Z"], ["0", "9"], ".", "_"], false, false),
      peg$c112 = function(lh, l) { return lh + l.join(''); },
      peg$c113 = peg$otherExpectation("label"),
      peg$c114 = ":",
      peg$c115 = peg$literalExpectation(":", false),
      peg$c116 = function(l) { return l; },
      peg$c117 = peg$otherExpectation("string"),
      peg$c118 = "\"",
      peg$c119 = peg$literalExpectation("\"", false),
      peg$c120 = /^[^"]/,
      peg$c121 = peg$classExpectation(["\""], true, false),
      peg$c122 = function(s) { return s.join(''); },
      peg$c123 = peg$otherExpectation("integer"),
      peg$c124 = peg$otherExpectation("bin integer"),
      peg$c125 = "0b",
      peg$c126 = peg$literalExpectation("0b", false),
      peg$c127 = /^[01]/,
      peg$c128 = peg$classExpectation(["0", "1"], false, false),
      peg$c129 = function(n) { return parseInt(n.join(''), 2); },
      peg$c130 = peg$otherExpectation("hex integer"),
      peg$c131 = "0x",
      peg$c132 = peg$literalExpectation("0x", false),
      peg$c133 = /^[0-9A-F]/,
      peg$c134 = peg$classExpectation([["0", "9"], ["A", "F"]], false, false),
      peg$c135 = function() { return parseInt(text(), 16); },
      peg$c136 = peg$otherExpectation("dec integer"),
      peg$c137 = /^[0-9]/,
      peg$c138 = peg$classExpectation([["0", "9"]], false, false),
      peg$c139 = function() { return parseInt(text(), 10); },
      peg$c140 = peg$otherExpectation("new line"),
      peg$c141 = /^[\n\r]/,
      peg$c142 = peg$classExpectation(["\n", "\r"], false, false),
      peg$c143 = peg$otherExpectation("whitespace"),
      peg$c144 = /^[ \t\n\r]/,
      peg$c145 = peg$classExpectation([" ", "\t", "\n", "\r"], false, false),

      peg$currPos          = 0,
      peg$savedPos         = 0,
      peg$posDetailsCache  = [{ line: 1, column: 1 }],
      peg$maxFailPos       = 0,
      peg$maxFailExpected  = [],
      peg$silentFails      = 0,

      peg$result;

  if ("startRule" in options) {
    if (!(options.startRule in peg$startRuleFunctions)) {
      throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
    }

    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
  }

  function text() {
    return input.substring(peg$savedPos, peg$currPos);
  }

  function location() {
    return peg$computeLocation(peg$savedPos, peg$currPos);
  }

  function expected(description, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildStructuredError(
      [peg$otherExpectation(description)],
      input.substring(peg$savedPos, peg$currPos),
      location
    );
  }

  function error(message, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildSimpleError(message, location);
  }

  function peg$literalExpectation(text, ignoreCase) {
    return { type: "literal", text: text, ignoreCase: ignoreCase };
  }

  function peg$classExpectation(parts, inverted, ignoreCase) {
    return { type: "class", parts: parts, inverted: inverted, ignoreCase: ignoreCase };
  }

  function peg$anyExpectation() {
    return { type: "any" };
  }

  function peg$endExpectation() {
    return { type: "end" };
  }

  function peg$otherExpectation(description) {
    return { type: "other", description: description };
  }

  function peg$computePosDetails(pos) {
    var details = peg$posDetailsCache[pos], p;

    if (details) {
      return details;
    } else {
      p = pos - 1;
      while (!peg$posDetailsCache[p]) {
        p--;
      }

      details = peg$posDetailsCache[p];
      details = {
        line:   details.line,
        column: details.column
      };

      while (p < pos) {
        if (input.charCodeAt(p) === 10) {
          details.line++;
          details.column = 1;
        } else {
          details.column++;
        }

        p++;
      }

      peg$posDetailsCache[pos] = details;
      return details;
    }
  }

  function peg$computeLocation(startPos, endPos) {
    var startPosDetails = peg$computePosDetails(startPos),
        endPosDetails   = peg$computePosDetails(endPos);

    return {
      start: {
        offset: startPos,
        line:   startPosDetails.line,
        column: startPosDetails.column
      },
      end: {
        offset: endPos,
        line:   endPosDetails.line,
        column: endPosDetails.column
      }
    };
  }

  function peg$fail(expected) {
    if (peg$currPos < peg$maxFailPos) { return; }

    if (peg$currPos > peg$maxFailPos) {
      peg$maxFailPos = peg$currPos;
      peg$maxFailExpected = [];
    }

    peg$maxFailExpected.push(expected);
  }

  function peg$buildSimpleError(message, location) {
    return new peg$SyntaxError(message, null, null, location);
  }

  function peg$buildStructuredError(expected, found, location) {
    return new peg$SyntaxError(
      peg$SyntaxError.buildMessage(expected, found),
      expected,
      found,
      location
    );
  }

  function peg$parseCode() {
    var s0, s1, s2, s3, s4, s5;

    peg$silentFails++;
    s0 = peg$currPos;
    s1 = peg$parseInstr();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = peg$parseNL();
      if (s4 !== peg$FAILED) {
        s5 = peg$parseInstr();
        if (s5 !== peg$FAILED) {
          s4 = [s4, s5];
          s3 = s4;
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = peg$parseNL();
        if (s4 !== peg$FAILED) {
          s5 = peg$parseInstr();
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseNL();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c1(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c0); }
    }

    return s0;
  }

  function peg$parseInstr() {
    var s0, s1, s2, s3;

    peg$silentFails++;
    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = peg$parseLabel();
    if (s2 !== peg$FAILED) {
      s3 = peg$parse_();
      if (s3 !== peg$FAILED) {
        s2 = [s2, s3];
        s1 = s2;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseTwoArgIns();
      if (s2 === peg$FAILED) {
        s2 = peg$parseOneArgIns();
        if (s2 === peg$FAILED) {
          s2 = peg$parseSingleIns();
          if (s2 === peg$FAILED) {
            s2 = peg$parseDataIns();
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c3(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c2); }
    }

    return s0;
  }

  function peg$parseDataIns() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c5) {
      s1 = peg$c5;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c6); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseInt();
        if (s3 === peg$FAILED) {
          s3 = peg$parseString();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c7(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3) === peg$c8) {
        s1 = peg$c8;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c9); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseInt();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 44) {
                s5 = peg$c10;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c11); }
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseInt();
                  if (s7 === peg$FAILED) {
                    s7 = peg$parseString();
                  }
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c12(s1, s3, s7);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c4); }
    }

    return s0;
  }

  function peg$parseTwoArgIns() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3) === peg$c14) {
      s1 = peg$c14;
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c15); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseReg();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 44) {
              s5 = peg$c10;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c11); }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parse_();
              if (s6 !== peg$FAILED) {
                s7 = peg$parseReg();
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c16(s1, s3, s7);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3) === peg$c14) {
        s1 = peg$c14;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c15); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseReg();
          if (s3 !== peg$FAILED) {
            s4 = peg$parse_();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 44) {
                s5 = peg$c10;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c11); }
              }
              if (s5 !== peg$FAILED) {
                s6 = peg$parse_();
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseRegAddr();
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c17(s1, s3, s7);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 3) === peg$c14) {
          s1 = peg$c14;
          peg$currPos += 3;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c15); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseReg();
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 44) {
                  s5 = peg$c10;
                  peg$currPos++;
                } else {
                  s5 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                }
                if (s5 !== peg$FAILED) {
                  s6 = peg$parse_();
                  if (s6 !== peg$FAILED) {
                    s7 = peg$parseConstAddr();
                    if (s7 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c18(s1, s3, s7);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 3) === peg$c14) {
            s1 = peg$c14;
            peg$currPos += 3;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c15); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parse_();
            if (s2 !== peg$FAILED) {
              s3 = peg$parseReg();
              if (s3 !== peg$FAILED) {
                s4 = peg$parse_();
                if (s4 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 44) {
                    s5 = peg$c10;
                    peg$currPos++;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = peg$parse_();
                    if (s6 !== peg$FAILED) {
                      s7 = peg$parseInt();
                      if (s7 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c19(s1, s3, s7);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 3) === peg$c20) {
              s1 = peg$c20;
              peg$currPos += 3;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c21); }
            }
            if (s1 !== peg$FAILED) {
              s2 = peg$parse_();
              if (s2 !== peg$FAILED) {
                s3 = peg$parseReg();
                if (s3 !== peg$FAILED) {
                  s4 = peg$parse_();
                  if (s4 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 44) {
                      s5 = peg$c10;
                      peg$currPos++;
                    } else {
                      s5 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c11); }
                    }
                    if (s5 !== peg$FAILED) {
                      s6 = peg$parse_();
                      if (s6 !== peg$FAILED) {
                        s7 = peg$parseReg();
                        if (s7 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c16(s1, s3, s7);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.substr(peg$currPos, 3) === peg$c20) {
                s1 = peg$c20;
                peg$currPos += 3;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c21); }
              }
              if (s1 !== peg$FAILED) {
                s2 = peg$parse_();
                if (s2 !== peg$FAILED) {
                  s3 = peg$parseReg();
                  if (s3 !== peg$FAILED) {
                    s4 = peg$parse_();
                    if (s4 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 44) {
                        s5 = peg$c10;
                        peg$currPos++;
                      } else {
                        s5 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                      }
                      if (s5 !== peg$FAILED) {
                        s6 = peg$parse_();
                        if (s6 !== peg$FAILED) {
                          s7 = peg$parseRegAddr();
                          if (s7 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c17(s1, s3, s7);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.substr(peg$currPos, 3) === peg$c20) {
                  s1 = peg$c20;
                  peg$currPos += 3;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c21); }
                }
                if (s1 !== peg$FAILED) {
                  s2 = peg$parse_();
                  if (s2 !== peg$FAILED) {
                    s3 = peg$parseReg();
                    if (s3 !== peg$FAILED) {
                      s4 = peg$parse_();
                      if (s4 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 44) {
                          s5 = peg$c10;
                          peg$currPos++;
                        } else {
                          s5 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                        }
                        if (s5 !== peg$FAILED) {
                          s6 = peg$parse_();
                          if (s6 !== peg$FAILED) {
                            s7 = peg$parseConstAddr();
                            if (s7 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c18(s1, s3, s7);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  if (input.substr(peg$currPos, 3) === peg$c20) {
                    s1 = peg$c20;
                    peg$currPos += 3;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c21); }
                  }
                  if (s1 !== peg$FAILED) {
                    s2 = peg$parse_();
                    if (s2 !== peg$FAILED) {
                      s3 = peg$parseReg();
                      if (s3 !== peg$FAILED) {
                        s4 = peg$parse_();
                        if (s4 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 44) {
                            s5 = peg$c10;
                            peg$currPos++;
                          } else {
                            s5 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                          }
                          if (s5 !== peg$FAILED) {
                            s6 = peg$parse_();
                            if (s6 !== peg$FAILED) {
                              s7 = peg$parseInt();
                              if (s7 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c19(s1, s3, s7);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                  if (s0 === peg$FAILED) {
                    s0 = peg$currPos;
                    if (input.substr(peg$currPos, 3) === peg$c22) {
                      s1 = peg$c22;
                      peg$currPos += 3;
                    } else {
                      s1 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c23); }
                    }
                    if (s1 !== peg$FAILED) {
                      s2 = peg$parse_();
                      if (s2 !== peg$FAILED) {
                        s3 = peg$parseReg();
                        if (s3 !== peg$FAILED) {
                          s4 = peg$parse_();
                          if (s4 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 44) {
                              s5 = peg$c10;
                              peg$currPos++;
                            } else {
                              s5 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c11); }
                            }
                            if (s5 !== peg$FAILED) {
                              s6 = peg$parse_();
                              if (s6 !== peg$FAILED) {
                                s7 = peg$parseReg();
                                if (s7 !== peg$FAILED) {
                                  peg$savedPos = s0;
                                  s1 = peg$c16(s1, s3, s7);
                                  s0 = s1;
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                    if (s0 === peg$FAILED) {
                      s0 = peg$currPos;
                      if (input.substr(peg$currPos, 3) === peg$c22) {
                        s1 = peg$c22;
                        peg$currPos += 3;
                      } else {
                        s1 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c23); }
                      }
                      if (s1 !== peg$FAILED) {
                        s2 = peg$parse_();
                        if (s2 !== peg$FAILED) {
                          s3 = peg$parseReg();
                          if (s3 !== peg$FAILED) {
                            s4 = peg$parse_();
                            if (s4 !== peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 44) {
                                s5 = peg$c10;
                                peg$currPos++;
                              } else {
                                s5 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c11); }
                              }
                              if (s5 !== peg$FAILED) {
                                s6 = peg$parse_();
                                if (s6 !== peg$FAILED) {
                                  s7 = peg$parseRegAddr();
                                  if (s7 !== peg$FAILED) {
                                    peg$savedPos = s0;
                                    s1 = peg$c17(s1, s3, s7);
                                    s0 = s1;
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                      if (s0 === peg$FAILED) {
                        s0 = peg$currPos;
                        if (input.substr(peg$currPos, 3) === peg$c22) {
                          s1 = peg$c22;
                          peg$currPos += 3;
                        } else {
                          s1 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c23); }
                        }
                        if (s1 !== peg$FAILED) {
                          s2 = peg$parse_();
                          if (s2 !== peg$FAILED) {
                            s3 = peg$parseReg();
                            if (s3 !== peg$FAILED) {
                              s4 = peg$parse_();
                              if (s4 !== peg$FAILED) {
                                if (input.charCodeAt(peg$currPos) === 44) {
                                  s5 = peg$c10;
                                  peg$currPos++;
                                } else {
                                  s5 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                }
                                if (s5 !== peg$FAILED) {
                                  s6 = peg$parse_();
                                  if (s6 !== peg$FAILED) {
                                    s7 = peg$parseConstAddr();
                                    if (s7 !== peg$FAILED) {
                                      peg$savedPos = s0;
                                      s1 = peg$c18(s1, s3, s7);
                                      s0 = s1;
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                        if (s0 === peg$FAILED) {
                          s0 = peg$currPos;
                          if (input.substr(peg$currPos, 3) === peg$c22) {
                            s1 = peg$c22;
                            peg$currPos += 3;
                          } else {
                            s1 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c23); }
                          }
                          if (s1 !== peg$FAILED) {
                            s2 = peg$parse_();
                            if (s2 !== peg$FAILED) {
                              s3 = peg$parseReg();
                              if (s3 !== peg$FAILED) {
                                s4 = peg$parse_();
                                if (s4 !== peg$FAILED) {
                                  if (input.charCodeAt(peg$currPos) === 44) {
                                    s5 = peg$c10;
                                    peg$currPos++;
                                  } else {
                                    s5 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                  }
                                  if (s5 !== peg$FAILED) {
                                    s6 = peg$parse_();
                                    if (s6 !== peg$FAILED) {
                                      s7 = peg$parseInt();
                                      if (s7 !== peg$FAILED) {
                                        peg$savedPos = s0;
                                        s1 = peg$c19(s1, s3, s7);
                                        s0 = s1;
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                          if (s0 === peg$FAILED) {
                            s0 = peg$currPos;
                            if (input.substr(peg$currPos, 3) === peg$c24) {
                              s1 = peg$c24;
                              peg$currPos += 3;
                            } else {
                              s1 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c25); }
                            }
                            if (s1 !== peg$FAILED) {
                              s2 = peg$parse_();
                              if (s2 !== peg$FAILED) {
                                s3 = peg$parseReg();
                                if (s3 !== peg$FAILED) {
                                  s4 = peg$parse_();
                                  if (s4 !== peg$FAILED) {
                                    if (input.charCodeAt(peg$currPos) === 44) {
                                      s5 = peg$c10;
                                      peg$currPos++;
                                    } else {
                                      s5 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                    }
                                    if (s5 !== peg$FAILED) {
                                      s6 = peg$parse_();
                                      if (s6 !== peg$FAILED) {
                                        s7 = peg$parseReg();
                                        if (s7 !== peg$FAILED) {
                                          peg$savedPos = s0;
                                          s1 = peg$c16(s1, s3, s7);
                                          s0 = s1;
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                            if (s0 === peg$FAILED) {
                              s0 = peg$currPos;
                              if (input.substr(peg$currPos, 3) === peg$c24) {
                                s1 = peg$c24;
                                peg$currPos += 3;
                              } else {
                                s1 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c25); }
                              }
                              if (s1 !== peg$FAILED) {
                                s2 = peg$parse_();
                                if (s2 !== peg$FAILED) {
                                  s3 = peg$parseReg();
                                  if (s3 !== peg$FAILED) {
                                    s4 = peg$parse_();
                                    if (s4 !== peg$FAILED) {
                                      if (input.charCodeAt(peg$currPos) === 44) {
                                        s5 = peg$c10;
                                        peg$currPos++;
                                      } else {
                                        s5 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                      }
                                      if (s5 !== peg$FAILED) {
                                        s6 = peg$parse_();
                                        if (s6 !== peg$FAILED) {
                                          s7 = peg$parseRegAddr();
                                          if (s7 !== peg$FAILED) {
                                            peg$savedPos = s0;
                                            s1 = peg$c17(s1, s3, s7);
                                            s0 = s1;
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                              if (s0 === peg$FAILED) {
                                s0 = peg$currPos;
                                if (input.substr(peg$currPos, 3) === peg$c24) {
                                  s1 = peg$c24;
                                  peg$currPos += 3;
                                } else {
                                  s1 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c25); }
                                }
                                if (s1 !== peg$FAILED) {
                                  s2 = peg$parse_();
                                  if (s2 !== peg$FAILED) {
                                    s3 = peg$parseReg();
                                    if (s3 !== peg$FAILED) {
                                      s4 = peg$parse_();
                                      if (s4 !== peg$FAILED) {
                                        if (input.charCodeAt(peg$currPos) === 44) {
                                          s5 = peg$c10;
                                          peg$currPos++;
                                        } else {
                                          s5 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                        }
                                        if (s5 !== peg$FAILED) {
                                          s6 = peg$parse_();
                                          if (s6 !== peg$FAILED) {
                                            s7 = peg$parseConstAddr();
                                            if (s7 !== peg$FAILED) {
                                              peg$savedPos = s0;
                                              s1 = peg$c18(s1, s3, s7);
                                              s0 = s1;
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                                if (s0 === peg$FAILED) {
                                  s0 = peg$currPos;
                                  if (input.substr(peg$currPos, 3) === peg$c24) {
                                    s1 = peg$c24;
                                    peg$currPos += 3;
                                  } else {
                                    s1 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c25); }
                                  }
                                  if (s1 !== peg$FAILED) {
                                    s2 = peg$parse_();
                                    if (s2 !== peg$FAILED) {
                                      s3 = peg$parseReg();
                                      if (s3 !== peg$FAILED) {
                                        s4 = peg$parse_();
                                        if (s4 !== peg$FAILED) {
                                          if (input.charCodeAt(peg$currPos) === 44) {
                                            s5 = peg$c10;
                                            peg$currPos++;
                                          } else {
                                            s5 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                          }
                                          if (s5 !== peg$FAILED) {
                                            s6 = peg$parse_();
                                            if (s6 !== peg$FAILED) {
                                              s7 = peg$parseInt();
                                              if (s7 !== peg$FAILED) {
                                                peg$savedPos = s0;
                                                s1 = peg$c19(s1, s3, s7);
                                                s0 = s1;
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                  if (s0 === peg$FAILED) {
                                    s0 = peg$currPos;
                                    if (input.substr(peg$currPos, 3) === peg$c26) {
                                      s1 = peg$c26;
                                      peg$currPos += 3;
                                    } else {
                                      s1 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c27); }
                                    }
                                    if (s1 !== peg$FAILED) {
                                      s2 = peg$parse_();
                                      if (s2 !== peg$FAILED) {
                                        s3 = peg$parseReg();
                                        if (s3 !== peg$FAILED) {
                                          s4 = peg$parse_();
                                          if (s4 !== peg$FAILED) {
                                            if (input.charCodeAt(peg$currPos) === 44) {
                                              s5 = peg$c10;
                                              peg$currPos++;
                                            } else {
                                              s5 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                            }
                                            if (s5 !== peg$FAILED) {
                                              s6 = peg$parse_();
                                              if (s6 !== peg$FAILED) {
                                                s7 = peg$parseReg();
                                                if (s7 !== peg$FAILED) {
                                                  peg$savedPos = s0;
                                                  s1 = peg$c16(s1, s3, s7);
                                                  s0 = s1;
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                    if (s0 === peg$FAILED) {
                                      s0 = peg$currPos;
                                      if (input.substr(peg$currPos, 3) === peg$c26) {
                                        s1 = peg$c26;
                                        peg$currPos += 3;
                                      } else {
                                        s1 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c27); }
                                      }
                                      if (s1 !== peg$FAILED) {
                                        s2 = peg$parse_();
                                        if (s2 !== peg$FAILED) {
                                          s3 = peg$parseReg();
                                          if (s3 !== peg$FAILED) {
                                            s4 = peg$parse_();
                                            if (s4 !== peg$FAILED) {
                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                s5 = peg$c10;
                                                peg$currPos++;
                                              } else {
                                                s5 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                              }
                                              if (s5 !== peg$FAILED) {
                                                s6 = peg$parse_();
                                                if (s6 !== peg$FAILED) {
                                                  s7 = peg$parseRegAddr();
                                                  if (s7 !== peg$FAILED) {
                                                    peg$savedPos = s0;
                                                    s1 = peg$c17(s1, s3, s7);
                                                    s0 = s1;
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                      if (s0 === peg$FAILED) {
                                        s0 = peg$currPos;
                                        if (input.substr(peg$currPos, 3) === peg$c26) {
                                          s1 = peg$c26;
                                          peg$currPos += 3;
                                        } else {
                                          s1 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c27); }
                                        }
                                        if (s1 !== peg$FAILED) {
                                          s2 = peg$parse_();
                                          if (s2 !== peg$FAILED) {
                                            s3 = peg$parseReg();
                                            if (s3 !== peg$FAILED) {
                                              s4 = peg$parse_();
                                              if (s4 !== peg$FAILED) {
                                                if (input.charCodeAt(peg$currPos) === 44) {
                                                  s5 = peg$c10;
                                                  peg$currPos++;
                                                } else {
                                                  s5 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                }
                                                if (s5 !== peg$FAILED) {
                                                  s6 = peg$parse_();
                                                  if (s6 !== peg$FAILED) {
                                                    s7 = peg$parseConstAddr();
                                                    if (s7 !== peg$FAILED) {
                                                      peg$savedPos = s0;
                                                      s1 = peg$c18(s1, s3, s7);
                                                      s0 = s1;
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                        if (s0 === peg$FAILED) {
                                          s0 = peg$currPos;
                                          if (input.substr(peg$currPos, 3) === peg$c26) {
                                            s1 = peg$c26;
                                            peg$currPos += 3;
                                          } else {
                                            s1 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c27); }
                                          }
                                          if (s1 !== peg$FAILED) {
                                            s2 = peg$parse_();
                                            if (s2 !== peg$FAILED) {
                                              s3 = peg$parseReg();
                                              if (s3 !== peg$FAILED) {
                                                s4 = peg$parse_();
                                                if (s4 !== peg$FAILED) {
                                                  if (input.charCodeAt(peg$currPos) === 44) {
                                                    s5 = peg$c10;
                                                    peg$currPos++;
                                                  } else {
                                                    s5 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                  }
                                                  if (s5 !== peg$FAILED) {
                                                    s6 = peg$parse_();
                                                    if (s6 !== peg$FAILED) {
                                                      s7 = peg$parseInt();
                                                      if (s7 !== peg$FAILED) {
                                                        peg$savedPos = s0;
                                                        s1 = peg$c19(s1, s3, s7);
                                                        s0 = s1;
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                          if (s0 === peg$FAILED) {
                                            s0 = peg$currPos;
                                            if (input.substr(peg$currPos, 2) === peg$c28) {
                                              s1 = peg$c28;
                                              peg$currPos += 2;
                                            } else {
                                              s1 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c29); }
                                            }
                                            if (s1 !== peg$FAILED) {
                                              s2 = peg$parse_();
                                              if (s2 !== peg$FAILED) {
                                                s3 = peg$parseReg();
                                                if (s3 !== peg$FAILED) {
                                                  s4 = peg$parse_();
                                                  if (s4 !== peg$FAILED) {
                                                    if (input.charCodeAt(peg$currPos) === 44) {
                                                      s5 = peg$c10;
                                                      peg$currPos++;
                                                    } else {
                                                      s5 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                    }
                                                    if (s5 !== peg$FAILED) {
                                                      s6 = peg$parse_();
                                                      if (s6 !== peg$FAILED) {
                                                        s7 = peg$parseReg();
                                                        if (s7 !== peg$FAILED) {
                                                          peg$savedPos = s0;
                                                          s1 = peg$c16(s1, s3, s7);
                                                          s0 = s1;
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                            if (s0 === peg$FAILED) {
                                              s0 = peg$currPos;
                                              if (input.substr(peg$currPos, 2) === peg$c28) {
                                                s1 = peg$c28;
                                                peg$currPos += 2;
                                              } else {
                                                s1 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c29); }
                                              }
                                              if (s1 !== peg$FAILED) {
                                                s2 = peg$parse_();
                                                if (s2 !== peg$FAILED) {
                                                  s3 = peg$parseReg();
                                                  if (s3 !== peg$FAILED) {
                                                    s4 = peg$parse_();
                                                    if (s4 !== peg$FAILED) {
                                                      if (input.charCodeAt(peg$currPos) === 44) {
                                                        s5 = peg$c10;
                                                        peg$currPos++;
                                                      } else {
                                                        s5 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                      }
                                                      if (s5 !== peg$FAILED) {
                                                        s6 = peg$parse_();
                                                        if (s6 !== peg$FAILED) {
                                                          s7 = peg$parseRegAddr();
                                                          if (s7 !== peg$FAILED) {
                                                            peg$savedPos = s0;
                                                            s1 = peg$c17(s1, s3, s7);
                                                            s0 = s1;
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                              if (s0 === peg$FAILED) {
                                                s0 = peg$currPos;
                                                if (input.substr(peg$currPos, 2) === peg$c28) {
                                                  s1 = peg$c28;
                                                  peg$currPos += 2;
                                                } else {
                                                  s1 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c29); }
                                                }
                                                if (s1 !== peg$FAILED) {
                                                  s2 = peg$parse_();
                                                  if (s2 !== peg$FAILED) {
                                                    s3 = peg$parseReg();
                                                    if (s3 !== peg$FAILED) {
                                                      s4 = peg$parse_();
                                                      if (s4 !== peg$FAILED) {
                                                        if (input.charCodeAt(peg$currPos) === 44) {
                                                          s5 = peg$c10;
                                                          peg$currPos++;
                                                        } else {
                                                          s5 = peg$FAILED;
                                                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                        }
                                                        if (s5 !== peg$FAILED) {
                                                          s6 = peg$parse_();
                                                          if (s6 !== peg$FAILED) {
                                                            s7 = peg$parseConstAddr();
                                                            if (s7 !== peg$FAILED) {
                                                              peg$savedPos = s0;
                                                              s1 = peg$c18(s1, s3, s7);
                                                              s0 = s1;
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                                if (s0 === peg$FAILED) {
                                                  s0 = peg$currPos;
                                                  if (input.substr(peg$currPos, 2) === peg$c28) {
                                                    s1 = peg$c28;
                                                    peg$currPos += 2;
                                                  } else {
                                                    s1 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c29); }
                                                  }
                                                  if (s1 !== peg$FAILED) {
                                                    s2 = peg$parse_();
                                                    if (s2 !== peg$FAILED) {
                                                      s3 = peg$parseReg();
                                                      if (s3 !== peg$FAILED) {
                                                        s4 = peg$parse_();
                                                        if (s4 !== peg$FAILED) {
                                                          if (input.charCodeAt(peg$currPos) === 44) {
                                                            s5 = peg$c10;
                                                            peg$currPos++;
                                                          } else {
                                                            s5 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                          }
                                                          if (s5 !== peg$FAILED) {
                                                            s6 = peg$parse_();
                                                            if (s6 !== peg$FAILED) {
                                                              s7 = peg$parseInt();
                                                              if (s7 !== peg$FAILED) {
                                                                peg$savedPos = s0;
                                                                s1 = peg$c19(s1, s3, s7);
                                                                s0 = s1;
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                  if (s0 === peg$FAILED) {
                                                    s0 = peg$currPos;
                                                    if (input.substr(peg$currPos, 3) === peg$c30) {
                                                      s1 = peg$c30;
                                                      peg$currPos += 3;
                                                    } else {
                                                      s1 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c31); }
                                                    }
                                                    if (s1 !== peg$FAILED) {
                                                      s2 = peg$parse_();
                                                      if (s2 !== peg$FAILED) {
                                                        s3 = peg$parseReg();
                                                        if (s3 !== peg$FAILED) {
                                                          s4 = peg$parse_();
                                                          if (s4 !== peg$FAILED) {
                                                            if (input.charCodeAt(peg$currPos) === 44) {
                                                              s5 = peg$c10;
                                                              peg$currPos++;
                                                            } else {
                                                              s5 = peg$FAILED;
                                                              if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                            }
                                                            if (s5 !== peg$FAILED) {
                                                              s6 = peg$parse_();
                                                              if (s6 !== peg$FAILED) {
                                                                s7 = peg$parseReg();
                                                                if (s7 !== peg$FAILED) {
                                                                  peg$savedPos = s0;
                                                                  s1 = peg$c16(s1, s3, s7);
                                                                  s0 = s1;
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                    if (s0 === peg$FAILED) {
                                                      s0 = peg$currPos;
                                                      if (input.substr(peg$currPos, 3) === peg$c30) {
                                                        s1 = peg$c30;
                                                        peg$currPos += 3;
                                                      } else {
                                                        s1 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c31); }
                                                      }
                                                      if (s1 !== peg$FAILED) {
                                                        s2 = peg$parse_();
                                                        if (s2 !== peg$FAILED) {
                                                          s3 = peg$parseReg();
                                                          if (s3 !== peg$FAILED) {
                                                            s4 = peg$parse_();
                                                            if (s4 !== peg$FAILED) {
                                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                                s5 = peg$c10;
                                                                peg$currPos++;
                                                              } else {
                                                                s5 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                              }
                                                              if (s5 !== peg$FAILED) {
                                                                s6 = peg$parse_();
                                                                if (s6 !== peg$FAILED) {
                                                                  s7 = peg$parseRegAddr();
                                                                  if (s7 !== peg$FAILED) {
                                                                    peg$savedPos = s0;
                                                                    s1 = peg$c17(s1, s3, s7);
                                                                    s0 = s1;
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                      if (s0 === peg$FAILED) {
                                                        s0 = peg$currPos;
                                                        if (input.substr(peg$currPos, 3) === peg$c30) {
                                                          s1 = peg$c30;
                                                          peg$currPos += 3;
                                                        } else {
                                                          s1 = peg$FAILED;
                                                          if (peg$silentFails === 0) { peg$fail(peg$c31); }
                                                        }
                                                        if (s1 !== peg$FAILED) {
                                                          s2 = peg$parse_();
                                                          if (s2 !== peg$FAILED) {
                                                            s3 = peg$parseReg();
                                                            if (s3 !== peg$FAILED) {
                                                              s4 = peg$parse_();
                                                              if (s4 !== peg$FAILED) {
                                                                if (input.charCodeAt(peg$currPos) === 44) {
                                                                  s5 = peg$c10;
                                                                  peg$currPos++;
                                                                } else {
                                                                  s5 = peg$FAILED;
                                                                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                }
                                                                if (s5 !== peg$FAILED) {
                                                                  s6 = peg$parse_();
                                                                  if (s6 !== peg$FAILED) {
                                                                    s7 = peg$parseConstAddr();
                                                                    if (s7 !== peg$FAILED) {
                                                                      peg$savedPos = s0;
                                                                      s1 = peg$c18(s1, s3, s7);
                                                                      s0 = s1;
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                        if (s0 === peg$FAILED) {
                                                          s0 = peg$currPos;
                                                          if (input.substr(peg$currPos, 3) === peg$c30) {
                                                            s1 = peg$c30;
                                                            peg$currPos += 3;
                                                          } else {
                                                            s1 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c31); }
                                                          }
                                                          if (s1 !== peg$FAILED) {
                                                            s2 = peg$parse_();
                                                            if (s2 !== peg$FAILED) {
                                                              s3 = peg$parseReg();
                                                              if (s3 !== peg$FAILED) {
                                                                s4 = peg$parse_();
                                                                if (s4 !== peg$FAILED) {
                                                                  if (input.charCodeAt(peg$currPos) === 44) {
                                                                    s5 = peg$c10;
                                                                    peg$currPos++;
                                                                  } else {
                                                                    s5 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                  }
                                                                  if (s5 !== peg$FAILED) {
                                                                    s6 = peg$parse_();
                                                                    if (s6 !== peg$FAILED) {
                                                                      s7 = peg$parseInt();
                                                                      if (s7 !== peg$FAILED) {
                                                                        peg$savedPos = s0;
                                                                        s1 = peg$c19(s1, s3, s7);
                                                                        s0 = s1;
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                          if (s0 === peg$FAILED) {
                                                            s0 = peg$currPos;
                                                            if (input.substr(peg$currPos, 3) === peg$c32) {
                                                              s1 = peg$c32;
                                                              peg$currPos += 3;
                                                            } else {
                                                              s1 = peg$FAILED;
                                                              if (peg$silentFails === 0) { peg$fail(peg$c33); }
                                                            }
                                                            if (s1 !== peg$FAILED) {
                                                              s2 = peg$parse_();
                                                              if (s2 !== peg$FAILED) {
                                                                s3 = peg$parseReg();
                                                                if (s3 !== peg$FAILED) {
                                                                  s4 = peg$parse_();
                                                                  if (s4 !== peg$FAILED) {
                                                                    if (input.charCodeAt(peg$currPos) === 44) {
                                                                      s5 = peg$c10;
                                                                      peg$currPos++;
                                                                    } else {
                                                                      s5 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                    }
                                                                    if (s5 !== peg$FAILED) {
                                                                      s6 = peg$parse_();
                                                                      if (s6 !== peg$FAILED) {
                                                                        s7 = peg$parseReg();
                                                                        if (s7 !== peg$FAILED) {
                                                                          peg$savedPos = s0;
                                                                          s1 = peg$c16(s1, s3, s7);
                                                                          s0 = s1;
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                            if (s0 === peg$FAILED) {
                                                              s0 = peg$currPos;
                                                              if (input.substr(peg$currPos, 3) === peg$c32) {
                                                                s1 = peg$c32;
                                                                peg$currPos += 3;
                                                              } else {
                                                                s1 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c33); }
                                                              }
                                                              if (s1 !== peg$FAILED) {
                                                                s2 = peg$parse_();
                                                                if (s2 !== peg$FAILED) {
                                                                  s3 = peg$parseReg();
                                                                  if (s3 !== peg$FAILED) {
                                                                    s4 = peg$parse_();
                                                                    if (s4 !== peg$FAILED) {
                                                                      if (input.charCodeAt(peg$currPos) === 44) {
                                                                        s5 = peg$c10;
                                                                        peg$currPos++;
                                                                      } else {
                                                                        s5 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                      }
                                                                      if (s5 !== peg$FAILED) {
                                                                        s6 = peg$parse_();
                                                                        if (s6 !== peg$FAILED) {
                                                                          s7 = peg$parseRegAddr();
                                                                          if (s7 !== peg$FAILED) {
                                                                            peg$savedPos = s0;
                                                                            s1 = peg$c17(s1, s3, s7);
                                                                            s0 = s1;
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                              if (s0 === peg$FAILED) {
                                                                s0 = peg$currPos;
                                                                if (input.substr(peg$currPos, 3) === peg$c32) {
                                                                  s1 = peg$c32;
                                                                  peg$currPos += 3;
                                                                } else {
                                                                  s1 = peg$FAILED;
                                                                  if (peg$silentFails === 0) { peg$fail(peg$c33); }
                                                                }
                                                                if (s1 !== peg$FAILED) {
                                                                  s2 = peg$parse_();
                                                                  if (s2 !== peg$FAILED) {
                                                                    s3 = peg$parseReg();
                                                                    if (s3 !== peg$FAILED) {
                                                                      s4 = peg$parse_();
                                                                      if (s4 !== peg$FAILED) {
                                                                        if (input.charCodeAt(peg$currPos) === 44) {
                                                                          s5 = peg$c10;
                                                                          peg$currPos++;
                                                                        } else {
                                                                          s5 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                        }
                                                                        if (s5 !== peg$FAILED) {
                                                                          s6 = peg$parse_();
                                                                          if (s6 !== peg$FAILED) {
                                                                            s7 = peg$parseConstAddr();
                                                                            if (s7 !== peg$FAILED) {
                                                                              peg$savedPos = s0;
                                                                              s1 = peg$c18(s1, s3, s7);
                                                                              s0 = s1;
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                                if (s0 === peg$FAILED) {
                                                                  s0 = peg$currPos;
                                                                  if (input.substr(peg$currPos, 3) === peg$c32) {
                                                                    s1 = peg$c32;
                                                                    peg$currPos += 3;
                                                                  } else {
                                                                    s1 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c33); }
                                                                  }
                                                                  if (s1 !== peg$FAILED) {
                                                                    s2 = peg$parse_();
                                                                    if (s2 !== peg$FAILED) {
                                                                      s3 = peg$parseReg();
                                                                      if (s3 !== peg$FAILED) {
                                                                        s4 = peg$parse_();
                                                                        if (s4 !== peg$FAILED) {
                                                                          if (input.charCodeAt(peg$currPos) === 44) {
                                                                            s5 = peg$c10;
                                                                            peg$currPos++;
                                                                          } else {
                                                                            s5 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                          }
                                                                          if (s5 !== peg$FAILED) {
                                                                            s6 = peg$parse_();
                                                                            if (s6 !== peg$FAILED) {
                                                                              s7 = peg$parseInt();
                                                                              if (s7 !== peg$FAILED) {
                                                                                peg$savedPos = s0;
                                                                                s1 = peg$c19(s1, s3, s7);
                                                                                s0 = s1;
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                  if (s0 === peg$FAILED) {
                                                                    s0 = peg$currPos;
                                                                    if (input.substr(peg$currPos, 3) === peg$c34) {
                                                                      s1 = peg$c34;
                                                                      peg$currPos += 3;
                                                                    } else {
                                                                      s1 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c35); }
                                                                    }
                                                                    if (s1 !== peg$FAILED) {
                                                                      s2 = peg$parse_();
                                                                      if (s2 !== peg$FAILED) {
                                                                        s3 = peg$parseReg();
                                                                        if (s3 !== peg$FAILED) {
                                                                          s4 = peg$parse_();
                                                                          if (s4 !== peg$FAILED) {
                                                                            if (input.charCodeAt(peg$currPos) === 44) {
                                                                              s5 = peg$c10;
                                                                              peg$currPos++;
                                                                            } else {
                                                                              s5 = peg$FAILED;
                                                                              if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                            }
                                                                            if (s5 !== peg$FAILED) {
                                                                              s6 = peg$parse_();
                                                                              if (s6 !== peg$FAILED) {
                                                                                s7 = peg$parseReg();
                                                                                if (s7 !== peg$FAILED) {
                                                                                  peg$savedPos = s0;
                                                                                  s1 = peg$c16(s1, s3, s7);
                                                                                  s0 = s1;
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                    if (s0 === peg$FAILED) {
                                                                      s0 = peg$currPos;
                                                                      if (input.substr(peg$currPos, 3) === peg$c34) {
                                                                        s1 = peg$c34;
                                                                        peg$currPos += 3;
                                                                      } else {
                                                                        s1 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c35); }
                                                                      }
                                                                      if (s1 !== peg$FAILED) {
                                                                        s2 = peg$parse_();
                                                                        if (s2 !== peg$FAILED) {
                                                                          s3 = peg$parseReg();
                                                                          if (s3 !== peg$FAILED) {
                                                                            s4 = peg$parse_();
                                                                            if (s4 !== peg$FAILED) {
                                                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                                                s5 = peg$c10;
                                                                                peg$currPos++;
                                                                              } else {
                                                                                s5 = peg$FAILED;
                                                                                if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                              }
                                                                              if (s5 !== peg$FAILED) {
                                                                                s6 = peg$parse_();
                                                                                if (s6 !== peg$FAILED) {
                                                                                  s7 = peg$parseRegAddr();
                                                                                  if (s7 !== peg$FAILED) {
                                                                                    peg$savedPos = s0;
                                                                                    s1 = peg$c17(s1, s3, s7);
                                                                                    s0 = s1;
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                      if (s0 === peg$FAILED) {
                                                                        s0 = peg$currPos;
                                                                        if (input.substr(peg$currPos, 3) === peg$c34) {
                                                                          s1 = peg$c34;
                                                                          peg$currPos += 3;
                                                                        } else {
                                                                          s1 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c35); }
                                                                        }
                                                                        if (s1 !== peg$FAILED) {
                                                                          s2 = peg$parse_();
                                                                          if (s2 !== peg$FAILED) {
                                                                            s3 = peg$parseReg();
                                                                            if (s3 !== peg$FAILED) {
                                                                              s4 = peg$parse_();
                                                                              if (s4 !== peg$FAILED) {
                                                                                if (input.charCodeAt(peg$currPos) === 44) {
                                                                                  s5 = peg$c10;
                                                                                  peg$currPos++;
                                                                                } else {
                                                                                  s5 = peg$FAILED;
                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                }
                                                                                if (s5 !== peg$FAILED) {
                                                                                  s6 = peg$parse_();
                                                                                  if (s6 !== peg$FAILED) {
                                                                                    s7 = peg$parseConstAddr();
                                                                                    if (s7 !== peg$FAILED) {
                                                                                      peg$savedPos = s0;
                                                                                      s1 = peg$c18(s1, s3, s7);
                                                                                      s0 = s1;
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                        if (s0 === peg$FAILED) {
                                                                          s0 = peg$currPos;
                                                                          if (input.substr(peg$currPos, 3) === peg$c34) {
                                                                            s1 = peg$c34;
                                                                            peg$currPos += 3;
                                                                          } else {
                                                                            s1 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c35); }
                                                                          }
                                                                          if (s1 !== peg$FAILED) {
                                                                            s2 = peg$parse_();
                                                                            if (s2 !== peg$FAILED) {
                                                                              s3 = peg$parseReg();
                                                                              if (s3 !== peg$FAILED) {
                                                                                s4 = peg$parse_();
                                                                                if (s4 !== peg$FAILED) {
                                                                                  if (input.charCodeAt(peg$currPos) === 44) {
                                                                                    s5 = peg$c10;
                                                                                    peg$currPos++;
                                                                                  } else {
                                                                                    s5 = peg$FAILED;
                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                  }
                                                                                  if (s5 !== peg$FAILED) {
                                                                                    s6 = peg$parse_();
                                                                                    if (s6 !== peg$FAILED) {
                                                                                      s7 = peg$parseInt();
                                                                                      if (s7 !== peg$FAILED) {
                                                                                        peg$savedPos = s0;
                                                                                        s1 = peg$c19(s1, s3, s7);
                                                                                        s0 = s1;
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                          if (s0 === peg$FAILED) {
                                                                            s0 = peg$currPos;
                                                                            if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                              s1 = peg$c36;
                                                                              peg$currPos += 3;
                                                                            } else {
                                                                              s1 = peg$FAILED;
                                                                              if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                            }
                                                                            if (s1 !== peg$FAILED) {
                                                                              s2 = peg$parse_();
                                                                              if (s2 !== peg$FAILED) {
                                                                                s3 = peg$parseReg();
                                                                                if (s3 !== peg$FAILED) {
                                                                                  s4 = peg$parse_();
                                                                                  if (s4 !== peg$FAILED) {
                                                                                    if (input.charCodeAt(peg$currPos) === 44) {
                                                                                      s5 = peg$c10;
                                                                                      peg$currPos++;
                                                                                    } else {
                                                                                      s5 = peg$FAILED;
                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                    }
                                                                                    if (s5 !== peg$FAILED) {
                                                                                      s6 = peg$parse_();
                                                                                      if (s6 !== peg$FAILED) {
                                                                                        s7 = peg$parseReg();
                                                                                        if (s7 !== peg$FAILED) {
                                                                                          peg$savedPos = s0;
                                                                                          s1 = peg$c16(s1, s3, s7);
                                                                                          s0 = s1;
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                            if (s0 === peg$FAILED) {
                                                                              s0 = peg$currPos;
                                                                              if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                s1 = peg$c36;
                                                                                peg$currPos += 3;
                                                                              } else {
                                                                                s1 = peg$FAILED;
                                                                                if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                              }
                                                                              if (s1 !== peg$FAILED) {
                                                                                s2 = peg$parse_();
                                                                                if (s2 !== peg$FAILED) {
                                                                                  s3 = peg$parseReg();
                                                                                  if (s3 !== peg$FAILED) {
                                                                                    s4 = peg$parse_();
                                                                                    if (s4 !== peg$FAILED) {
                                                                                      if (input.charCodeAt(peg$currPos) === 44) {
                                                                                        s5 = peg$c10;
                                                                                        peg$currPos++;
                                                                                      } else {
                                                                                        s5 = peg$FAILED;
                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                      }
                                                                                      if (s5 !== peg$FAILED) {
                                                                                        s6 = peg$parse_();
                                                                                        if (s6 !== peg$FAILED) {
                                                                                          s7 = peg$parseRegAddr();
                                                                                          if (s7 !== peg$FAILED) {
                                                                                            peg$savedPos = s0;
                                                                                            s1 = peg$c17(s1, s3, s7);
                                                                                            s0 = s1;
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                              if (s0 === peg$FAILED) {
                                                                                s0 = peg$currPos;
                                                                                if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                  s1 = peg$c36;
                                                                                  peg$currPos += 3;
                                                                                } else {
                                                                                  s1 = peg$FAILED;
                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                }
                                                                                if (s1 !== peg$FAILED) {
                                                                                  s2 = peg$parse_();
                                                                                  if (s2 !== peg$FAILED) {
                                                                                    s3 = peg$parseReg();
                                                                                    if (s3 !== peg$FAILED) {
                                                                                      s4 = peg$parse_();
                                                                                      if (s4 !== peg$FAILED) {
                                                                                        if (input.charCodeAt(peg$currPos) === 44) {
                                                                                          s5 = peg$c10;
                                                                                          peg$currPos++;
                                                                                        } else {
                                                                                          s5 = peg$FAILED;
                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                        }
                                                                                        if (s5 !== peg$FAILED) {
                                                                                          s6 = peg$parse_();
                                                                                          if (s6 !== peg$FAILED) {
                                                                                            s7 = peg$parseConstAddr();
                                                                                            if (s7 !== peg$FAILED) {
                                                                                              peg$savedPos = s0;
                                                                                              s1 = peg$c18(s1, s3, s7);
                                                                                              s0 = s1;
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                                if (s0 === peg$FAILED) {
                                                                                  s0 = peg$currPos;
                                                                                  if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                    s1 = peg$c36;
                                                                                    peg$currPos += 3;
                                                                                  } else {
                                                                                    s1 = peg$FAILED;
                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                  }
                                                                                  if (s1 !== peg$FAILED) {
                                                                                    s2 = peg$parse_();
                                                                                    if (s2 !== peg$FAILED) {
                                                                                      s3 = peg$parseReg();
                                                                                      if (s3 !== peg$FAILED) {
                                                                                        s4 = peg$parse_();
                                                                                        if (s4 !== peg$FAILED) {
                                                                                          if (input.charCodeAt(peg$currPos) === 44) {
                                                                                            s5 = peg$c10;
                                                                                            peg$currPos++;
                                                                                          } else {
                                                                                            s5 = peg$FAILED;
                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                          }
                                                                                          if (s5 !== peg$FAILED) {
                                                                                            s6 = peg$parse_();
                                                                                            if (s6 !== peg$FAILED) {
                                                                                              s7 = peg$parseInt();
                                                                                              if (s7 !== peg$FAILED) {
                                                                                                peg$savedPos = s0;
                                                                                                s1 = peg$c19(s1, s3, s7);
                                                                                                s0 = s1;
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                  if (s0 === peg$FAILED) {
                                                                                    s0 = peg$currPos;
                                                                                    if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                      s1 = peg$c36;
                                                                                      peg$currPos += 3;
                                                                                    } else {
                                                                                      s1 = peg$FAILED;
                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                    }
                                                                                    if (s1 !== peg$FAILED) {
                                                                                      s2 = peg$parse_();
                                                                                      if (s2 !== peg$FAILED) {
                                                                                        s3 = peg$parseRegAddr();
                                                                                        if (s3 !== peg$FAILED) {
                                                                                          s4 = peg$parse_();
                                                                                          if (s4 !== peg$FAILED) {
                                                                                            if (input.charCodeAt(peg$currPos) === 44) {
                                                                                              s5 = peg$c10;
                                                                                              peg$currPos++;
                                                                                            } else {
                                                                                              s5 = peg$FAILED;
                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                            }
                                                                                            if (s5 !== peg$FAILED) {
                                                                                              s6 = peg$parse_();
                                                                                              if (s6 !== peg$FAILED) {
                                                                                                s7 = peg$parseReg();
                                                                                                if (s7 !== peg$FAILED) {
                                                                                                  peg$savedPos = s0;
                                                                                                  s1 = peg$c38(s1, s3, s7);
                                                                                                  s0 = s1;
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                    if (s0 === peg$FAILED) {
                                                                                      s0 = peg$currPos;
                                                                                      if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                        s1 = peg$c36;
                                                                                        peg$currPos += 3;
                                                                                      } else {
                                                                                        s1 = peg$FAILED;
                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                      }
                                                                                      if (s1 !== peg$FAILED) {
                                                                                        s2 = peg$parse_();
                                                                                        if (s2 !== peg$FAILED) {
                                                                                          s3 = peg$parseConstAddr();
                                                                                          if (s3 !== peg$FAILED) {
                                                                                            s4 = peg$parse_();
                                                                                            if (s4 !== peg$FAILED) {
                                                                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                s5 = peg$c10;
                                                                                                peg$currPos++;
                                                                                              } else {
                                                                                                s5 = peg$FAILED;
                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                              }
                                                                                              if (s5 !== peg$FAILED) {
                                                                                                s6 = peg$parse_();
                                                                                                if (s6 !== peg$FAILED) {
                                                                                                  s7 = peg$parseReg();
                                                                                                  if (s7 !== peg$FAILED) {
                                                                                                    peg$savedPos = s0;
                                                                                                    s1 = peg$c39(s1, s3, s7);
                                                                                                    s0 = s1;
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                      if (s0 === peg$FAILED) {
                                                                                        s0 = peg$currPos;
                                                                                        if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                          s1 = peg$c36;
                                                                                          peg$currPos += 3;
                                                                                        } else {
                                                                                          s1 = peg$FAILED;
                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                        }
                                                                                        if (s1 !== peg$FAILED) {
                                                                                          s2 = peg$parse_();
                                                                                          if (s2 !== peg$FAILED) {
                                                                                            s3 = peg$parseRegAddr();
                                                                                            if (s3 !== peg$FAILED) {
                                                                                              s4 = peg$parse_();
                                                                                              if (s4 !== peg$FAILED) {
                                                                                                if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                  s5 = peg$c10;
                                                                                                  peg$currPos++;
                                                                                                } else {
                                                                                                  s5 = peg$FAILED;
                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                }
                                                                                                if (s5 !== peg$FAILED) {
                                                                                                  s6 = peg$parse_();
                                                                                                  if (s6 !== peg$FAILED) {
                                                                                                    s7 = peg$parseInt();
                                                                                                    if (s7 !== peg$FAILED) {
                                                                                                      peg$savedPos = s0;
                                                                                                      s1 = peg$c40(s1, s3, s7);
                                                                                                      s0 = s1;
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                        if (s0 === peg$FAILED) {
                                                                                          s0 = peg$currPos;
                                                                                          if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                            s1 = peg$c36;
                                                                                            peg$currPos += 3;
                                                                                          } else {
                                                                                            s1 = peg$FAILED;
                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                          }
                                                                                          if (s1 !== peg$FAILED) {
                                                                                            s2 = peg$parse_();
                                                                                            if (s2 !== peg$FAILED) {
                                                                                              s3 = peg$parseConstAddr();
                                                                                              if (s3 !== peg$FAILED) {
                                                                                                s4 = peg$parse_();
                                                                                                if (s4 !== peg$FAILED) {
                                                                                                  if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                    s5 = peg$c10;
                                                                                                    peg$currPos++;
                                                                                                  } else {
                                                                                                    s5 = peg$FAILED;
                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                  }
                                                                                                  if (s5 !== peg$FAILED) {
                                                                                                    s6 = peg$parse_();
                                                                                                    if (s6 !== peg$FAILED) {
                                                                                                      s7 = peg$parseInt();
                                                                                                      if (s7 !== peg$FAILED) {
                                                                                                        peg$savedPos = s0;
                                                                                                        s1 = peg$c41(s1, s3, s7);
                                                                                                        s0 = s1;
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                          if (s0 === peg$FAILED) {
                                                                                            s0 = peg$currPos;
                                                                                            if (input.substr(peg$currPos, 3) === peg$c42) {
                                                                                              s1 = peg$c42;
                                                                                              peg$currPos += 3;
                                                                                            } else {
                                                                                              s1 = peg$FAILED;
                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c43); }
                                                                                            }
                                                                                            if (s1 !== peg$FAILED) {
                                                                                              s2 = peg$parse_();
                                                                                              if (s2 !== peg$FAILED) {
                                                                                                s3 = peg$parseReg();
                                                                                                if (s3 !== peg$FAILED) {
                                                                                                  s4 = peg$parse_();
                                                                                                  if (s4 !== peg$FAILED) {
                                                                                                    if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                      s5 = peg$c10;
                                                                                                      peg$currPos++;
                                                                                                    } else {
                                                                                                      s5 = peg$FAILED;
                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                    }
                                                                                                    if (s5 !== peg$FAILED) {
                                                                                                      s6 = peg$parse_();
                                                                                                      if (s6 !== peg$FAILED) {
                                                                                                        s7 = peg$parseReg();
                                                                                                        if (s7 !== peg$FAILED) {
                                                                                                          peg$savedPos = s0;
                                                                                                          s1 = peg$c16(s1, s3, s7);
                                                                                                          s0 = s1;
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                            if (s0 === peg$FAILED) {
                                                                                              s0 = peg$currPos;
                                                                                              if (input.substr(peg$currPos, 3) === peg$c42) {
                                                                                                s1 = peg$c42;
                                                                                                peg$currPos += 3;
                                                                                              } else {
                                                                                                s1 = peg$FAILED;
                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c43); }
                                                                                              }
                                                                                              if (s1 !== peg$FAILED) {
                                                                                                s2 = peg$parse_();
                                                                                                if (s2 !== peg$FAILED) {
                                                                                                  s3 = peg$parseReg();
                                                                                                  if (s3 !== peg$FAILED) {
                                                                                                    s4 = peg$parse_();
                                                                                                    if (s4 !== peg$FAILED) {
                                                                                                      if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                        s5 = peg$c10;
                                                                                                        peg$currPos++;
                                                                                                      } else {
                                                                                                        s5 = peg$FAILED;
                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                      }
                                                                                                      if (s5 !== peg$FAILED) {
                                                                                                        s6 = peg$parse_();
                                                                                                        if (s6 !== peg$FAILED) {
                                                                                                          s7 = peg$parseRegAddr();
                                                                                                          if (s7 !== peg$FAILED) {
                                                                                                            peg$savedPos = s0;
                                                                                                            s1 = peg$c17(s1, s3, s7);
                                                                                                            s0 = s1;
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                              if (s0 === peg$FAILED) {
                                                                                                s0 = peg$currPos;
                                                                                                if (input.substr(peg$currPos, 3) === peg$c42) {
                                                                                                  s1 = peg$c42;
                                                                                                  peg$currPos += 3;
                                                                                                } else {
                                                                                                  s1 = peg$FAILED;
                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c43); }
                                                                                                }
                                                                                                if (s1 !== peg$FAILED) {
                                                                                                  s2 = peg$parse_();
                                                                                                  if (s2 !== peg$FAILED) {
                                                                                                    s3 = peg$parseReg();
                                                                                                    if (s3 !== peg$FAILED) {
                                                                                                      s4 = peg$parse_();
                                                                                                      if (s4 !== peg$FAILED) {
                                                                                                        if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                          s5 = peg$c10;
                                                                                                          peg$currPos++;
                                                                                                        } else {
                                                                                                          s5 = peg$FAILED;
                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                        }
                                                                                                        if (s5 !== peg$FAILED) {
                                                                                                          s6 = peg$parse_();
                                                                                                          if (s6 !== peg$FAILED) {
                                                                                                            s7 = peg$parseConstAddr();
                                                                                                            if (s7 !== peg$FAILED) {
                                                                                                              peg$savedPos = s0;
                                                                                                              s1 = peg$c18(s1, s3, s7);
                                                                                                              s0 = s1;
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                                if (s0 === peg$FAILED) {
                                                                                                  s0 = peg$currPos;
                                                                                                  if (input.substr(peg$currPos, 3) === peg$c42) {
                                                                                                    s1 = peg$c42;
                                                                                                    peg$currPos += 3;
                                                                                                  } else {
                                                                                                    s1 = peg$FAILED;
                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c43); }
                                                                                                  }
                                                                                                  if (s1 !== peg$FAILED) {
                                                                                                    s2 = peg$parse_();
                                                                                                    if (s2 !== peg$FAILED) {
                                                                                                      s3 = peg$parseReg();
                                                                                                      if (s3 !== peg$FAILED) {
                                                                                                        s4 = peg$parse_();
                                                                                                        if (s4 !== peg$FAILED) {
                                                                                                          if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                            s5 = peg$c10;
                                                                                                            peg$currPos++;
                                                                                                          } else {
                                                                                                            s5 = peg$FAILED;
                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                          }
                                                                                                          if (s5 !== peg$FAILED) {
                                                                                                            s6 = peg$parse_();
                                                                                                            if (s6 !== peg$FAILED) {
                                                                                                              s7 = peg$parseInt();
                                                                                                              if (s7 !== peg$FAILED) {
                                                                                                                peg$savedPos = s0;
                                                                                                                s1 = peg$c19(s1, s3, s7);
                                                                                                                s0 = s1;
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                  if (s0 === peg$FAILED) {
                                                                                                    s0 = peg$currPos;
                                                                                                    if (input.substr(peg$currPos, 3) === peg$c14) {
                                                                                                      s1 = peg$c14;
                                                                                                      peg$currPos += 3;
                                                                                                    } else {
                                                                                                      s1 = peg$FAILED;
                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c15); }
                                                                                                    }
                                                                                                    if (s1 !== peg$FAILED) {
                                                                                                      s2 = peg$parse_();
                                                                                                      if (s2 !== peg$FAILED) {
                                                                                                        s3 = peg$parseReg();
                                                                                                        if (s3 !== peg$FAILED) {
                                                                                                          s4 = peg$parse_();
                                                                                                          if (s4 !== peg$FAILED) {
                                                                                                            if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                              s5 = peg$c10;
                                                                                                              peg$currPos++;
                                                                                                            } else {
                                                                                                              s5 = peg$FAILED;
                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                            }
                                                                                                            if (s5 !== peg$FAILED) {
                                                                                                              s6 = peg$parse_();
                                                                                                              if (s6 !== peg$FAILED) {
                                                                                                                s7 = peg$parseLabelAddr();
                                                                                                                if (s7 !== peg$FAILED) {
                                                                                                                  peg$savedPos = s0;
                                                                                                                  s1 = peg$c18(s1, s3, s7);
                                                                                                                  s0 = s1;
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                    if (s0 === peg$FAILED) {
                                                                                                      s0 = peg$currPos;
                                                                                                      if (input.substr(peg$currPos, 3) === peg$c20) {
                                                                                                        s1 = peg$c20;
                                                                                                        peg$currPos += 3;
                                                                                                      } else {
                                                                                                        s1 = peg$FAILED;
                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c21); }
                                                                                                      }
                                                                                                      if (s1 !== peg$FAILED) {
                                                                                                        s2 = peg$parse_();
                                                                                                        if (s2 !== peg$FAILED) {
                                                                                                          s3 = peg$parseReg();
                                                                                                          if (s3 !== peg$FAILED) {
                                                                                                            s4 = peg$parse_();
                                                                                                            if (s4 !== peg$FAILED) {
                                                                                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                s5 = peg$c10;
                                                                                                                peg$currPos++;
                                                                                                              } else {
                                                                                                                s5 = peg$FAILED;
                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                              }
                                                                                                              if (s5 !== peg$FAILED) {
                                                                                                                s6 = peg$parse_();
                                                                                                                if (s6 !== peg$FAILED) {
                                                                                                                  s7 = peg$parseLabelAddr();
                                                                                                                  if (s7 !== peg$FAILED) {
                                                                                                                    peg$savedPos = s0;
                                                                                                                    s1 = peg$c18(s1, s3, s7);
                                                                                                                    s0 = s1;
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                      if (s0 === peg$FAILED) {
                                                                                                        s0 = peg$currPos;
                                                                                                        if (input.substr(peg$currPos, 3) === peg$c22) {
                                                                                                          s1 = peg$c22;
                                                                                                          peg$currPos += 3;
                                                                                                        } else {
                                                                                                          s1 = peg$FAILED;
                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c23); }
                                                                                                        }
                                                                                                        if (s1 !== peg$FAILED) {
                                                                                                          s2 = peg$parse_();
                                                                                                          if (s2 !== peg$FAILED) {
                                                                                                            s3 = peg$parseReg();
                                                                                                            if (s3 !== peg$FAILED) {
                                                                                                              s4 = peg$parse_();
                                                                                                              if (s4 !== peg$FAILED) {
                                                                                                                if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                  s5 = peg$c10;
                                                                                                                  peg$currPos++;
                                                                                                                } else {
                                                                                                                  s5 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                }
                                                                                                                if (s5 !== peg$FAILED) {
                                                                                                                  s6 = peg$parse_();
                                                                                                                  if (s6 !== peg$FAILED) {
                                                                                                                    s7 = peg$parseLabelAddr();
                                                                                                                    if (s7 !== peg$FAILED) {
                                                                                                                      peg$savedPos = s0;
                                                                                                                      s1 = peg$c18(s1, s3, s7);
                                                                                                                      s0 = s1;
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                        if (s0 === peg$FAILED) {
                                                                                                          s0 = peg$currPos;
                                                                                                          if (input.substr(peg$currPos, 3) === peg$c24) {
                                                                                                            s1 = peg$c24;
                                                                                                            peg$currPos += 3;
                                                                                                          } else {
                                                                                                            s1 = peg$FAILED;
                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c25); }
                                                                                                          }
                                                                                                          if (s1 !== peg$FAILED) {
                                                                                                            s2 = peg$parse_();
                                                                                                            if (s2 !== peg$FAILED) {
                                                                                                              s3 = peg$parseReg();
                                                                                                              if (s3 !== peg$FAILED) {
                                                                                                                s4 = peg$parse_();
                                                                                                                if (s4 !== peg$FAILED) {
                                                                                                                  if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                    s5 = peg$c10;
                                                                                                                    peg$currPos++;
                                                                                                                  } else {
                                                                                                                    s5 = peg$FAILED;
                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                  }
                                                                                                                  if (s5 !== peg$FAILED) {
                                                                                                                    s6 = peg$parse_();
                                                                                                                    if (s6 !== peg$FAILED) {
                                                                                                                      s7 = peg$parseLabelAddr();
                                                                                                                      if (s7 !== peg$FAILED) {
                                                                                                                        peg$savedPos = s0;
                                                                                                                        s1 = peg$c18(s1, s3, s7);
                                                                                                                        s0 = s1;
                                                                                                                      } else {
                                                                                                                        peg$currPos = s0;
                                                                                                                        s0 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                          if (s0 === peg$FAILED) {
                                                                                                            s0 = peg$currPos;
                                                                                                            if (input.substr(peg$currPos, 3) === peg$c26) {
                                                                                                              s1 = peg$c26;
                                                                                                              peg$currPos += 3;
                                                                                                            } else {
                                                                                                              s1 = peg$FAILED;
                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c27); }
                                                                                                            }
                                                                                                            if (s1 !== peg$FAILED) {
                                                                                                              s2 = peg$parse_();
                                                                                                              if (s2 !== peg$FAILED) {
                                                                                                                s3 = peg$parseReg();
                                                                                                                if (s3 !== peg$FAILED) {
                                                                                                                  s4 = peg$parse_();
                                                                                                                  if (s4 !== peg$FAILED) {
                                                                                                                    if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                      s5 = peg$c10;
                                                                                                                      peg$currPos++;
                                                                                                                    } else {
                                                                                                                      s5 = peg$FAILED;
                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                    }
                                                                                                                    if (s5 !== peg$FAILED) {
                                                                                                                      s6 = peg$parse_();
                                                                                                                      if (s6 !== peg$FAILED) {
                                                                                                                        s7 = peg$parseLabelAddr();
                                                                                                                        if (s7 !== peg$FAILED) {
                                                                                                                          peg$savedPos = s0;
                                                                                                                          s1 = peg$c18(s1, s3, s7);
                                                                                                                          s0 = s1;
                                                                                                                        } else {
                                                                                                                          peg$currPos = s0;
                                                                                                                          s0 = peg$FAILED;
                                                                                                                        }
                                                                                                                      } else {
                                                                                                                        peg$currPos = s0;
                                                                                                                        s0 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                            if (s0 === peg$FAILED) {
                                                                                                              s0 = peg$currPos;
                                                                                                              if (input.substr(peg$currPos, 2) === peg$c28) {
                                                                                                                s1 = peg$c28;
                                                                                                                peg$currPos += 2;
                                                                                                              } else {
                                                                                                                s1 = peg$FAILED;
                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c29); }
                                                                                                              }
                                                                                                              if (s1 !== peg$FAILED) {
                                                                                                                s2 = peg$parse_();
                                                                                                                if (s2 !== peg$FAILED) {
                                                                                                                  s3 = peg$parseReg();
                                                                                                                  if (s3 !== peg$FAILED) {
                                                                                                                    s4 = peg$parse_();
                                                                                                                    if (s4 !== peg$FAILED) {
                                                                                                                      if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                        s5 = peg$c10;
                                                                                                                        peg$currPos++;
                                                                                                                      } else {
                                                                                                                        s5 = peg$FAILED;
                                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                      }
                                                                                                                      if (s5 !== peg$FAILED) {
                                                                                                                        s6 = peg$parse_();
                                                                                                                        if (s6 !== peg$FAILED) {
                                                                                                                          s7 = peg$parseLabelAddr();
                                                                                                                          if (s7 !== peg$FAILED) {
                                                                                                                            peg$savedPos = s0;
                                                                                                                            s1 = peg$c18(s1, s3, s7);
                                                                                                                            s0 = s1;
                                                                                                                          } else {
                                                                                                                            peg$currPos = s0;
                                                                                                                            s0 = peg$FAILED;
                                                                                                                          }
                                                                                                                        } else {
                                                                                                                          peg$currPos = s0;
                                                                                                                          s0 = peg$FAILED;
                                                                                                                        }
                                                                                                                      } else {
                                                                                                                        peg$currPos = s0;
                                                                                                                        s0 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                              if (s0 === peg$FAILED) {
                                                                                                                s0 = peg$currPos;
                                                                                                                if (input.substr(peg$currPos, 3) === peg$c30) {
                                                                                                                  s1 = peg$c30;
                                                                                                                  peg$currPos += 3;
                                                                                                                } else {
                                                                                                                  s1 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c31); }
                                                                                                                }
                                                                                                                if (s1 !== peg$FAILED) {
                                                                                                                  s2 = peg$parse_();
                                                                                                                  if (s2 !== peg$FAILED) {
                                                                                                                    s3 = peg$parseReg();
                                                                                                                    if (s3 !== peg$FAILED) {
                                                                                                                      s4 = peg$parse_();
                                                                                                                      if (s4 !== peg$FAILED) {
                                                                                                                        if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                          s5 = peg$c10;
                                                                                                                          peg$currPos++;
                                                                                                                        } else {
                                                                                                                          s5 = peg$FAILED;
                                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                        }
                                                                                                                        if (s5 !== peg$FAILED) {
                                                                                                                          s6 = peg$parse_();
                                                                                                                          if (s6 !== peg$FAILED) {
                                                                                                                            s7 = peg$parseLabelAddr();
                                                                                                                            if (s7 !== peg$FAILED) {
                                                                                                                              peg$savedPos = s0;
                                                                                                                              s1 = peg$c18(s1, s3, s7);
                                                                                                                              s0 = s1;
                                                                                                                            } else {
                                                                                                                              peg$currPos = s0;
                                                                                                                              s0 = peg$FAILED;
                                                                                                                            }
                                                                                                                          } else {
                                                                                                                            peg$currPos = s0;
                                                                                                                            s0 = peg$FAILED;
                                                                                                                          }
                                                                                                                        } else {
                                                                                                                          peg$currPos = s0;
                                                                                                                          s0 = peg$FAILED;
                                                                                                                        }
                                                                                                                      } else {
                                                                                                                        peg$currPos = s0;
                                                                                                                        s0 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                                if (s0 === peg$FAILED) {
                                                                                                                  s0 = peg$currPos;
                                                                                                                  if (input.substr(peg$currPos, 3) === peg$c32) {
                                                                                                                    s1 = peg$c32;
                                                                                                                    peg$currPos += 3;
                                                                                                                  } else {
                                                                                                                    s1 = peg$FAILED;
                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c33); }
                                                                                                                  }
                                                                                                                  if (s1 !== peg$FAILED) {
                                                                                                                    s2 = peg$parse_();
                                                                                                                    if (s2 !== peg$FAILED) {
                                                                                                                      s3 = peg$parseReg();
                                                                                                                      if (s3 !== peg$FAILED) {
                                                                                                                        s4 = peg$parse_();
                                                                                                                        if (s4 !== peg$FAILED) {
                                                                                                                          if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                            s5 = peg$c10;
                                                                                                                            peg$currPos++;
                                                                                                                          } else {
                                                                                                                            s5 = peg$FAILED;
                                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                          }
                                                                                                                          if (s5 !== peg$FAILED) {
                                                                                                                            s6 = peg$parse_();
                                                                                                                            if (s6 !== peg$FAILED) {
                                                                                                                              s7 = peg$parseLabelAddr();
                                                                                                                              if (s7 !== peg$FAILED) {
                                                                                                                                peg$savedPos = s0;
                                                                                                                                s1 = peg$c18(s1, s3, s7);
                                                                                                                                s0 = s1;
                                                                                                                              } else {
                                                                                                                                peg$currPos = s0;
                                                                                                                                s0 = peg$FAILED;
                                                                                                                              }
                                                                                                                            } else {
                                                                                                                              peg$currPos = s0;
                                                                                                                              s0 = peg$FAILED;
                                                                                                                            }
                                                                                                                          } else {
                                                                                                                            peg$currPos = s0;
                                                                                                                            s0 = peg$FAILED;
                                                                                                                          }
                                                                                                                        } else {
                                                                                                                          peg$currPos = s0;
                                                                                                                          s0 = peg$FAILED;
                                                                                                                        }
                                                                                                                      } else {
                                                                                                                        peg$currPos = s0;
                                                                                                                        s0 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                  if (s0 === peg$FAILED) {
                                                                                                                    s0 = peg$currPos;
                                                                                                                    if (input.substr(peg$currPos, 3) === peg$c34) {
                                                                                                                      s1 = peg$c34;
                                                                                                                      peg$currPos += 3;
                                                                                                                    } else {
                                                                                                                      s1 = peg$FAILED;
                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c35); }
                                                                                                                    }
                                                                                                                    if (s1 !== peg$FAILED) {
                                                                                                                      s2 = peg$parse_();
                                                                                                                      if (s2 !== peg$FAILED) {
                                                                                                                        s3 = peg$parseReg();
                                                                                                                        if (s3 !== peg$FAILED) {
                                                                                                                          s4 = peg$parse_();
                                                                                                                          if (s4 !== peg$FAILED) {
                                                                                                                            if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                              s5 = peg$c10;
                                                                                                                              peg$currPos++;
                                                                                                                            } else {
                                                                                                                              s5 = peg$FAILED;
                                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                            }
                                                                                                                            if (s5 !== peg$FAILED) {
                                                                                                                              s6 = peg$parse_();
                                                                                                                              if (s6 !== peg$FAILED) {
                                                                                                                                s7 = peg$parseLabelAddr();
                                                                                                                                if (s7 !== peg$FAILED) {
                                                                                                                                  peg$savedPos = s0;
                                                                                                                                  s1 = peg$c18(s1, s3, s7);
                                                                                                                                  s0 = s1;
                                                                                                                                } else {
                                                                                                                                  peg$currPos = s0;
                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                }
                                                                                                                              } else {
                                                                                                                                peg$currPos = s0;
                                                                                                                                s0 = peg$FAILED;
                                                                                                                              }
                                                                                                                            } else {
                                                                                                                              peg$currPos = s0;
                                                                                                                              s0 = peg$FAILED;
                                                                                                                            }
                                                                                                                          } else {
                                                                                                                            peg$currPos = s0;
                                                                                                                            s0 = peg$FAILED;
                                                                                                                          }
                                                                                                                        } else {
                                                                                                                          peg$currPos = s0;
                                                                                                                          s0 = peg$FAILED;
                                                                                                                        }
                                                                                                                      } else {
                                                                                                                        peg$currPos = s0;
                                                                                                                        s0 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                    if (s0 === peg$FAILED) {
                                                                                                                      s0 = peg$currPos;
                                                                                                                      if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                                                        s1 = peg$c36;
                                                                                                                        peg$currPos += 3;
                                                                                                                      } else {
                                                                                                                        s1 = peg$FAILED;
                                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                                                      }
                                                                                                                      if (s1 !== peg$FAILED) {
                                                                                                                        s2 = peg$parse_();
                                                                                                                        if (s2 !== peg$FAILED) {
                                                                                                                          s3 = peg$parseReg();
                                                                                                                          if (s3 !== peg$FAILED) {
                                                                                                                            s4 = peg$parse_();
                                                                                                                            if (s4 !== peg$FAILED) {
                                                                                                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                s5 = peg$c10;
                                                                                                                                peg$currPos++;
                                                                                                                              } else {
                                                                                                                                s5 = peg$FAILED;
                                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                              }
                                                                                                                              if (s5 !== peg$FAILED) {
                                                                                                                                s6 = peg$parse_();
                                                                                                                                if (s6 !== peg$FAILED) {
                                                                                                                                  s7 = peg$parseLabelAddr();
                                                                                                                                  if (s7 !== peg$FAILED) {
                                                                                                                                    peg$savedPos = s0;
                                                                                                                                    s1 = peg$c18(s1, s3, s7);
                                                                                                                                    s0 = s1;
                                                                                                                                  } else {
                                                                                                                                    peg$currPos = s0;
                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                  }
                                                                                                                                } else {
                                                                                                                                  peg$currPos = s0;
                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                }
                                                                                                                              } else {
                                                                                                                                peg$currPos = s0;
                                                                                                                                s0 = peg$FAILED;
                                                                                                                              }
                                                                                                                            } else {
                                                                                                                              peg$currPos = s0;
                                                                                                                              s0 = peg$FAILED;
                                                                                                                            }
                                                                                                                          } else {
                                                                                                                            peg$currPos = s0;
                                                                                                                            s0 = peg$FAILED;
                                                                                                                          }
                                                                                                                        } else {
                                                                                                                          peg$currPos = s0;
                                                                                                                          s0 = peg$FAILED;
                                                                                                                        }
                                                                                                                      } else {
                                                                                                                        peg$currPos = s0;
                                                                                                                        s0 = peg$FAILED;
                                                                                                                      }
                                                                                                                      if (s0 === peg$FAILED) {
                                                                                                                        s0 = peg$currPos;
                                                                                                                        if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                                                          s1 = peg$c36;
                                                                                                                          peg$currPos += 3;
                                                                                                                        } else {
                                                                                                                          s1 = peg$FAILED;
                                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                                                        }
                                                                                                                        if (s1 !== peg$FAILED) {
                                                                                                                          s2 = peg$parse_();
                                                                                                                          if (s2 !== peg$FAILED) {
                                                                                                                            s3 = peg$parseLabelAddr();
                                                                                                                            if (s3 !== peg$FAILED) {
                                                                                                                              s4 = peg$parse_();
                                                                                                                              if (s4 !== peg$FAILED) {
                                                                                                                                if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                  s5 = peg$c10;
                                                                                                                                  peg$currPos++;
                                                                                                                                } else {
                                                                                                                                  s5 = peg$FAILED;
                                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                }
                                                                                                                                if (s5 !== peg$FAILED) {
                                                                                                                                  s6 = peg$parse_();
                                                                                                                                  if (s6 !== peg$FAILED) {
                                                                                                                                    s7 = peg$parseReg();
                                                                                                                                    if (s7 !== peg$FAILED) {
                                                                                                                                      peg$savedPos = s0;
                                                                                                                                      s1 = peg$c39(s1, s3, s7);
                                                                                                                                      s0 = s1;
                                                                                                                                    } else {
                                                                                                                                      peg$currPos = s0;
                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                    }
                                                                                                                                  } else {
                                                                                                                                    peg$currPos = s0;
                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                  }
                                                                                                                                } else {
                                                                                                                                  peg$currPos = s0;
                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                }
                                                                                                                              } else {
                                                                                                                                peg$currPos = s0;
                                                                                                                                s0 = peg$FAILED;
                                                                                                                              }
                                                                                                                            } else {
                                                                                                                              peg$currPos = s0;
                                                                                                                              s0 = peg$FAILED;
                                                                                                                            }
                                                                                                                          } else {
                                                                                                                            peg$currPos = s0;
                                                                                                                            s0 = peg$FAILED;
                                                                                                                          }
                                                                                                                        } else {
                                                                                                                          peg$currPos = s0;
                                                                                                                          s0 = peg$FAILED;
                                                                                                                        }
                                                                                                                        if (s0 === peg$FAILED) {
                                                                                                                          s0 = peg$currPos;
                                                                                                                          if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                                                            s1 = peg$c36;
                                                                                                                            peg$currPos += 3;
                                                                                                                          } else {
                                                                                                                            s1 = peg$FAILED;
                                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                                                          }
                                                                                                                          if (s1 !== peg$FAILED) {
                                                                                                                            s2 = peg$parse_();
                                                                                                                            if (s2 !== peg$FAILED) {
                                                                                                                              s3 = peg$parseLabelAddr();
                                                                                                                              if (s3 !== peg$FAILED) {
                                                                                                                                s4 = peg$parse_();
                                                                                                                                if (s4 !== peg$FAILED) {
                                                                                                                                  if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                    s5 = peg$c10;
                                                                                                                                    peg$currPos++;
                                                                                                                                  } else {
                                                                                                                                    s5 = peg$FAILED;
                                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                  }
                                                                                                                                  if (s5 !== peg$FAILED) {
                                                                                                                                    s6 = peg$parse_();
                                                                                                                                    if (s6 !== peg$FAILED) {
                                                                                                                                      s7 = peg$parseInt();
                                                                                                                                      if (s7 !== peg$FAILED) {
                                                                                                                                        peg$savedPos = s0;
                                                                                                                                        s1 = peg$c41(s1, s3, s7);
                                                                                                                                        s0 = s1;
                                                                                                                                      } else {
                                                                                                                                        peg$currPos = s0;
                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                      }
                                                                                                                                    } else {
                                                                                                                                      peg$currPos = s0;
                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                    }
                                                                                                                                  } else {
                                                                                                                                    peg$currPos = s0;
                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                  }
                                                                                                                                } else {
                                                                                                                                  peg$currPos = s0;
                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                }
                                                                                                                              } else {
                                                                                                                                peg$currPos = s0;
                                                                                                                                s0 = peg$FAILED;
                                                                                                                              }
                                                                                                                            } else {
                                                                                                                              peg$currPos = s0;
                                                                                                                              s0 = peg$FAILED;
                                                                                                                            }
                                                                                                                          } else {
                                                                                                                            peg$currPos = s0;
                                                                                                                            s0 = peg$FAILED;
                                                                                                                          }
                                                                                                                          if (s0 === peg$FAILED) {
                                                                                                                            s0 = peg$currPos;
                                                                                                                            if (input.substr(peg$currPos, 3) === peg$c42) {
                                                                                                                              s1 = peg$c42;
                                                                                                                              peg$currPos += 3;
                                                                                                                            } else {
                                                                                                                              s1 = peg$FAILED;
                                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c43); }
                                                                                                                            }
                                                                                                                            if (s1 !== peg$FAILED) {
                                                                                                                              s2 = peg$parse_();
                                                                                                                              if (s2 !== peg$FAILED) {
                                                                                                                                s3 = peg$parseReg();
                                                                                                                                if (s3 !== peg$FAILED) {
                                                                                                                                  s4 = peg$parse_();
                                                                                                                                  if (s4 !== peg$FAILED) {
                                                                                                                                    if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                      s5 = peg$c10;
                                                                                                                                      peg$currPos++;
                                                                                                                                    } else {
                                                                                                                                      s5 = peg$FAILED;
                                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                    }
                                                                                                                                    if (s5 !== peg$FAILED) {
                                                                                                                                      s6 = peg$parse_();
                                                                                                                                      if (s6 !== peg$FAILED) {
                                                                                                                                        s7 = peg$parseLabelAddr();
                                                                                                                                        if (s7 !== peg$FAILED) {
                                                                                                                                          peg$savedPos = s0;
                                                                                                                                          s1 = peg$c18(s1, s3, s7);
                                                                                                                                          s0 = s1;
                                                                                                                                        } else {
                                                                                                                                          peg$currPos = s0;
                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                        }
                                                                                                                                      } else {
                                                                                                                                        peg$currPos = s0;
                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                      }
                                                                                                                                    } else {
                                                                                                                                      peg$currPos = s0;
                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                    }
                                                                                                                                  } else {
                                                                                                                                    peg$currPos = s0;
                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                  }
                                                                                                                                } else {
                                                                                                                                  peg$currPos = s0;
                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                }
                                                                                                                              } else {
                                                                                                                                peg$currPos = s0;
                                                                                                                                s0 = peg$FAILED;
                                                                                                                              }
                                                                                                                            } else {
                                                                                                                              peg$currPos = s0;
                                                                                                                              s0 = peg$FAILED;
                                                                                                                            }
                                                                                                                            if (s0 === peg$FAILED) {
                                                                                                                              s0 = peg$currPos;
                                                                                                                              if (input.substr(peg$currPos, 3) === peg$c14) {
                                                                                                                                s1 = peg$c14;
                                                                                                                                peg$currPos += 3;
                                                                                                                              } else {
                                                                                                                                s1 = peg$FAILED;
                                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c15); }
                                                                                                                              }
                                                                                                                              if (s1 !== peg$FAILED) {
                                                                                                                                s2 = peg$parse_();
                                                                                                                                if (s2 !== peg$FAILED) {
                                                                                                                                  s3 = peg$parseReg();
                                                                                                                                  if (s3 !== peg$FAILED) {
                                                                                                                                    s4 = peg$parse_();
                                                                                                                                    if (s4 !== peg$FAILED) {
                                                                                                                                      if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                        s5 = peg$c10;
                                                                                                                                        peg$currPos++;
                                                                                                                                      } else {
                                                                                                                                        s5 = peg$FAILED;
                                                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                      }
                                                                                                                                      if (s5 !== peg$FAILED) {
                                                                                                                                        s6 = peg$parse_();
                                                                                                                                        if (s6 !== peg$FAILED) {
                                                                                                                                          s7 = peg$parseLabelRef();
                                                                                                                                          if (s7 !== peg$FAILED) {
                                                                                                                                            peg$savedPos = s0;
                                                                                                                                            s1 = peg$c44(s1, s3, s7);
                                                                                                                                            s0 = s1;
                                                                                                                                          } else {
                                                                                                                                            peg$currPos = s0;
                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                          }
                                                                                                                                        } else {
                                                                                                                                          peg$currPos = s0;
                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                        }
                                                                                                                                      } else {
                                                                                                                                        peg$currPos = s0;
                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                      }
                                                                                                                                    } else {
                                                                                                                                      peg$currPos = s0;
                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                    }
                                                                                                                                  } else {
                                                                                                                                    peg$currPos = s0;
                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                  }
                                                                                                                                } else {
                                                                                                                                  peg$currPos = s0;
                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                }
                                                                                                                              } else {
                                                                                                                                peg$currPos = s0;
                                                                                                                                s0 = peg$FAILED;
                                                                                                                              }
                                                                                                                              if (s0 === peg$FAILED) {
                                                                                                                                s0 = peg$currPos;
                                                                                                                                if (input.substr(peg$currPos, 3) === peg$c20) {
                                                                                                                                  s1 = peg$c20;
                                                                                                                                  peg$currPos += 3;
                                                                                                                                } else {
                                                                                                                                  s1 = peg$FAILED;
                                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c21); }
                                                                                                                                }
                                                                                                                                if (s1 !== peg$FAILED) {
                                                                                                                                  s2 = peg$parse_();
                                                                                                                                  if (s2 !== peg$FAILED) {
                                                                                                                                    s3 = peg$parseReg();
                                                                                                                                    if (s3 !== peg$FAILED) {
                                                                                                                                      s4 = peg$parse_();
                                                                                                                                      if (s4 !== peg$FAILED) {
                                                                                                                                        if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                          s5 = peg$c10;
                                                                                                                                          peg$currPos++;
                                                                                                                                        } else {
                                                                                                                                          s5 = peg$FAILED;
                                                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                        }
                                                                                                                                        if (s5 !== peg$FAILED) {
                                                                                                                                          s6 = peg$parse_();
                                                                                                                                          if (s6 !== peg$FAILED) {
                                                                                                                                            s7 = peg$parseLabelRef();
                                                                                                                                            if (s7 !== peg$FAILED) {
                                                                                                                                              peg$savedPos = s0;
                                                                                                                                              s1 = peg$c44(s1, s3, s7);
                                                                                                                                              s0 = s1;
                                                                                                                                            } else {
                                                                                                                                              peg$currPos = s0;
                                                                                                                                              s0 = peg$FAILED;
                                                                                                                                            }
                                                                                                                                          } else {
                                                                                                                                            peg$currPos = s0;
                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                          }
                                                                                                                                        } else {
                                                                                                                                          peg$currPos = s0;
                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                        }
                                                                                                                                      } else {
                                                                                                                                        peg$currPos = s0;
                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                      }
                                                                                                                                    } else {
                                                                                                                                      peg$currPos = s0;
                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                    }
                                                                                                                                  } else {
                                                                                                                                    peg$currPos = s0;
                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                  }
                                                                                                                                } else {
                                                                                                                                  peg$currPos = s0;
                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                }
                                                                                                                                if (s0 === peg$FAILED) {
                                                                                                                                  s0 = peg$currPos;
                                                                                                                                  if (input.substr(peg$currPos, 3) === peg$c22) {
                                                                                                                                    s1 = peg$c22;
                                                                                                                                    peg$currPos += 3;
                                                                                                                                  } else {
                                                                                                                                    s1 = peg$FAILED;
                                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c23); }
                                                                                                                                  }
                                                                                                                                  if (s1 !== peg$FAILED) {
                                                                                                                                    s2 = peg$parse_();
                                                                                                                                    if (s2 !== peg$FAILED) {
                                                                                                                                      s3 = peg$parseReg();
                                                                                                                                      if (s3 !== peg$FAILED) {
                                                                                                                                        s4 = peg$parse_();
                                                                                                                                        if (s4 !== peg$FAILED) {
                                                                                                                                          if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                            s5 = peg$c10;
                                                                                                                                            peg$currPos++;
                                                                                                                                          } else {
                                                                                                                                            s5 = peg$FAILED;
                                                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                          }
                                                                                                                                          if (s5 !== peg$FAILED) {
                                                                                                                                            s6 = peg$parse_();
                                                                                                                                            if (s6 !== peg$FAILED) {
                                                                                                                                              s7 = peg$parseLabelRef();
                                                                                                                                              if (s7 !== peg$FAILED) {
                                                                                                                                                peg$savedPos = s0;
                                                                                                                                                s1 = peg$c44(s1, s3, s7);
                                                                                                                                                s0 = s1;
                                                                                                                                              } else {
                                                                                                                                                peg$currPos = s0;
                                                                                                                                                s0 = peg$FAILED;
                                                                                                                                              }
                                                                                                                                            } else {
                                                                                                                                              peg$currPos = s0;
                                                                                                                                              s0 = peg$FAILED;
                                                                                                                                            }
                                                                                                                                          } else {
                                                                                                                                            peg$currPos = s0;
                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                          }
                                                                                                                                        } else {
                                                                                                                                          peg$currPos = s0;
                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                        }
                                                                                                                                      } else {
                                                                                                                                        peg$currPos = s0;
                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                      }
                                                                                                                                    } else {
                                                                                                                                      peg$currPos = s0;
                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                    }
                                                                                                                                  } else {
                                                                                                                                    peg$currPos = s0;
                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                  }
                                                                                                                                  if (s0 === peg$FAILED) {
                                                                                                                                    s0 = peg$currPos;
                                                                                                                                    if (input.substr(peg$currPos, 3) === peg$c24) {
                                                                                                                                      s1 = peg$c24;
                                                                                                                                      peg$currPos += 3;
                                                                                                                                    } else {
                                                                                                                                      s1 = peg$FAILED;
                                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c25); }
                                                                                                                                    }
                                                                                                                                    if (s1 !== peg$FAILED) {
                                                                                                                                      s2 = peg$parse_();
                                                                                                                                      if (s2 !== peg$FAILED) {
                                                                                                                                        s3 = peg$parseReg();
                                                                                                                                        if (s3 !== peg$FAILED) {
                                                                                                                                          s4 = peg$parse_();
                                                                                                                                          if (s4 !== peg$FAILED) {
                                                                                                                                            if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                              s5 = peg$c10;
                                                                                                                                              peg$currPos++;
                                                                                                                                            } else {
                                                                                                                                              s5 = peg$FAILED;
                                                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                            }
                                                                                                                                            if (s5 !== peg$FAILED) {
                                                                                                                                              s6 = peg$parse_();
                                                                                                                                              if (s6 !== peg$FAILED) {
                                                                                                                                                s7 = peg$parseLabelRef();
                                                                                                                                                if (s7 !== peg$FAILED) {
                                                                                                                                                  peg$savedPos = s0;
                                                                                                                                                  s1 = peg$c44(s1, s3, s7);
                                                                                                                                                  s0 = s1;
                                                                                                                                                } else {
                                                                                                                                                  peg$currPos = s0;
                                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                                }
                                                                                                                                              } else {
                                                                                                                                                peg$currPos = s0;
                                                                                                                                                s0 = peg$FAILED;
                                                                                                                                              }
                                                                                                                                            } else {
                                                                                                                                              peg$currPos = s0;
                                                                                                                                              s0 = peg$FAILED;
                                                                                                                                            }
                                                                                                                                          } else {
                                                                                                                                            peg$currPos = s0;
                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                          }
                                                                                                                                        } else {
                                                                                                                                          peg$currPos = s0;
                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                        }
                                                                                                                                      } else {
                                                                                                                                        peg$currPos = s0;
                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                      }
                                                                                                                                    } else {
                                                                                                                                      peg$currPos = s0;
                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                    }
                                                                                                                                    if (s0 === peg$FAILED) {
                                                                                                                                      s0 = peg$currPos;
                                                                                                                                      if (input.substr(peg$currPos, 3) === peg$c26) {
                                                                                                                                        s1 = peg$c26;
                                                                                                                                        peg$currPos += 3;
                                                                                                                                      } else {
                                                                                                                                        s1 = peg$FAILED;
                                                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c27); }
                                                                                                                                      }
                                                                                                                                      if (s1 !== peg$FAILED) {
                                                                                                                                        s2 = peg$parse_();
                                                                                                                                        if (s2 !== peg$FAILED) {
                                                                                                                                          s3 = peg$parseReg();
                                                                                                                                          if (s3 !== peg$FAILED) {
                                                                                                                                            s4 = peg$parse_();
                                                                                                                                            if (s4 !== peg$FAILED) {
                                                                                                                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                                s5 = peg$c10;
                                                                                                                                                peg$currPos++;
                                                                                                                                              } else {
                                                                                                                                                s5 = peg$FAILED;
                                                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                              }
                                                                                                                                              if (s5 !== peg$FAILED) {
                                                                                                                                                s6 = peg$parse_();
                                                                                                                                                if (s6 !== peg$FAILED) {
                                                                                                                                                  s7 = peg$parseLabelRef();
                                                                                                                                                  if (s7 !== peg$FAILED) {
                                                                                                                                                    peg$savedPos = s0;
                                                                                                                                                    s1 = peg$c44(s1, s3, s7);
                                                                                                                                                    s0 = s1;
                                                                                                                                                  } else {
                                                                                                                                                    peg$currPos = s0;
                                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                                  }
                                                                                                                                                } else {
                                                                                                                                                  peg$currPos = s0;
                                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                                }
                                                                                                                                              } else {
                                                                                                                                                peg$currPos = s0;
                                                                                                                                                s0 = peg$FAILED;
                                                                                                                                              }
                                                                                                                                            } else {
                                                                                                                                              peg$currPos = s0;
                                                                                                                                              s0 = peg$FAILED;
                                                                                                                                            }
                                                                                                                                          } else {
                                                                                                                                            peg$currPos = s0;
                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                          }
                                                                                                                                        } else {
                                                                                                                                          peg$currPos = s0;
                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                        }
                                                                                                                                      } else {
                                                                                                                                        peg$currPos = s0;
                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                      }
                                                                                                                                      if (s0 === peg$FAILED) {
                                                                                                                                        s0 = peg$currPos;
                                                                                                                                        if (input.substr(peg$currPos, 2) === peg$c28) {
                                                                                                                                          s1 = peg$c28;
                                                                                                                                          peg$currPos += 2;
                                                                                                                                        } else {
                                                                                                                                          s1 = peg$FAILED;
                                                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c29); }
                                                                                                                                        }
                                                                                                                                        if (s1 !== peg$FAILED) {
                                                                                                                                          s2 = peg$parse_();
                                                                                                                                          if (s2 !== peg$FAILED) {
                                                                                                                                            s3 = peg$parseReg();
                                                                                                                                            if (s3 !== peg$FAILED) {
                                                                                                                                              s4 = peg$parse_();
                                                                                                                                              if (s4 !== peg$FAILED) {
                                                                                                                                                if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                                  s5 = peg$c10;
                                                                                                                                                  peg$currPos++;
                                                                                                                                                } else {
                                                                                                                                                  s5 = peg$FAILED;
                                                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                                }
                                                                                                                                                if (s5 !== peg$FAILED) {
                                                                                                                                                  s6 = peg$parse_();
                                                                                                                                                  if (s6 !== peg$FAILED) {
                                                                                                                                                    s7 = peg$parseLabelRef();
                                                                                                                                                    if (s7 !== peg$FAILED) {
                                                                                                                                                      peg$savedPos = s0;
                                                                                                                                                      s1 = peg$c44(s1, s3, s7);
                                                                                                                                                      s0 = s1;
                                                                                                                                                    } else {
                                                                                                                                                      peg$currPos = s0;
                                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                                    }
                                                                                                                                                  } else {
                                                                                                                                                    peg$currPos = s0;
                                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                                  }
                                                                                                                                                } else {
                                                                                                                                                  peg$currPos = s0;
                                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                                }
                                                                                                                                              } else {
                                                                                                                                                peg$currPos = s0;
                                                                                                                                                s0 = peg$FAILED;
                                                                                                                                              }
                                                                                                                                            } else {
                                                                                                                                              peg$currPos = s0;
                                                                                                                                              s0 = peg$FAILED;
                                                                                                                                            }
                                                                                                                                          } else {
                                                                                                                                            peg$currPos = s0;
                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                          }
                                                                                                                                        } else {
                                                                                                                                          peg$currPos = s0;
                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                        }
                                                                                                                                        if (s0 === peg$FAILED) {
                                                                                                                                          s0 = peg$currPos;
                                                                                                                                          if (input.substr(peg$currPos, 3) === peg$c30) {
                                                                                                                                            s1 = peg$c30;
                                                                                                                                            peg$currPos += 3;
                                                                                                                                          } else {
                                                                                                                                            s1 = peg$FAILED;
                                                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c31); }
                                                                                                                                          }
                                                                                                                                          if (s1 !== peg$FAILED) {
                                                                                                                                            s2 = peg$parse_();
                                                                                                                                            if (s2 !== peg$FAILED) {
                                                                                                                                              s3 = peg$parseReg();
                                                                                                                                              if (s3 !== peg$FAILED) {
                                                                                                                                                s4 = peg$parse_();
                                                                                                                                                if (s4 !== peg$FAILED) {
                                                                                                                                                  if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                                    s5 = peg$c10;
                                                                                                                                                    peg$currPos++;
                                                                                                                                                  } else {
                                                                                                                                                    s5 = peg$FAILED;
                                                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                                  }
                                                                                                                                                  if (s5 !== peg$FAILED) {
                                                                                                                                                    s6 = peg$parse_();
                                                                                                                                                    if (s6 !== peg$FAILED) {
                                                                                                                                                      s7 = peg$parseLabelRef();
                                                                                                                                                      if (s7 !== peg$FAILED) {
                                                                                                                                                        peg$savedPos = s0;
                                                                                                                                                        s1 = peg$c44(s1, s3, s7);
                                                                                                                                                        s0 = s1;
                                                                                                                                                      } else {
                                                                                                                                                        peg$currPos = s0;
                                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                                      }
                                                                                                                                                    } else {
                                                                                                                                                      peg$currPos = s0;
                                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                                    }
                                                                                                                                                  } else {
                                                                                                                                                    peg$currPos = s0;
                                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                                  }
                                                                                                                                                } else {
                                                                                                                                                  peg$currPos = s0;
                                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                                }
                                                                                                                                              } else {
                                                                                                                                                peg$currPos = s0;
                                                                                                                                                s0 = peg$FAILED;
                                                                                                                                              }
                                                                                                                                            } else {
                                                                                                                                              peg$currPos = s0;
                                                                                                                                              s0 = peg$FAILED;
                                                                                                                                            }
                                                                                                                                          } else {
                                                                                                                                            peg$currPos = s0;
                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                          }
                                                                                                                                          if (s0 === peg$FAILED) {
                                                                                                                                            s0 = peg$currPos;
                                                                                                                                            if (input.substr(peg$currPos, 3) === peg$c32) {
                                                                                                                                              s1 = peg$c32;
                                                                                                                                              peg$currPos += 3;
                                                                                                                                            } else {
                                                                                                                                              s1 = peg$FAILED;
                                                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c33); }
                                                                                                                                            }
                                                                                                                                            if (s1 !== peg$FAILED) {
                                                                                                                                              s2 = peg$parse_();
                                                                                                                                              if (s2 !== peg$FAILED) {
                                                                                                                                                s3 = peg$parseReg();
                                                                                                                                                if (s3 !== peg$FAILED) {
                                                                                                                                                  s4 = peg$parse_();
                                                                                                                                                  if (s4 !== peg$FAILED) {
                                                                                                                                                    if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                                      s5 = peg$c10;
                                                                                                                                                      peg$currPos++;
                                                                                                                                                    } else {
                                                                                                                                                      s5 = peg$FAILED;
                                                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                                    }
                                                                                                                                                    if (s5 !== peg$FAILED) {
                                                                                                                                                      s6 = peg$parse_();
                                                                                                                                                      if (s6 !== peg$FAILED) {
                                                                                                                                                        s7 = peg$parseLabelRef();
                                                                                                                                                        if (s7 !== peg$FAILED) {
                                                                                                                                                          peg$savedPos = s0;
                                                                                                                                                          s1 = peg$c44(s1, s3, s7);
                                                                                                                                                          s0 = s1;
                                                                                                                                                        } else {
                                                                                                                                                          peg$currPos = s0;
                                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                                        }
                                                                                                                                                      } else {
                                                                                                                                                        peg$currPos = s0;
                                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                                      }
                                                                                                                                                    } else {
                                                                                                                                                      peg$currPos = s0;
                                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                                    }
                                                                                                                                                  } else {
                                                                                                                                                    peg$currPos = s0;
                                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                                  }
                                                                                                                                                } else {
                                                                                                                                                  peg$currPos = s0;
                                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                                }
                                                                                                                                              } else {
                                                                                                                                                peg$currPos = s0;
                                                                                                                                                s0 = peg$FAILED;
                                                                                                                                              }
                                                                                                                                            } else {
                                                                                                                                              peg$currPos = s0;
                                                                                                                                              s0 = peg$FAILED;
                                                                                                                                            }
                                                                                                                                            if (s0 === peg$FAILED) {
                                                                                                                                              s0 = peg$currPos;
                                                                                                                                              if (input.substr(peg$currPos, 3) === peg$c34) {
                                                                                                                                                s1 = peg$c34;
                                                                                                                                                peg$currPos += 3;
                                                                                                                                              } else {
                                                                                                                                                s1 = peg$FAILED;
                                                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c35); }
                                                                                                                                              }
                                                                                                                                              if (s1 !== peg$FAILED) {
                                                                                                                                                s2 = peg$parse_();
                                                                                                                                                if (s2 !== peg$FAILED) {
                                                                                                                                                  s3 = peg$parseReg();
                                                                                                                                                  if (s3 !== peg$FAILED) {
                                                                                                                                                    s4 = peg$parse_();
                                                                                                                                                    if (s4 !== peg$FAILED) {
                                                                                                                                                      if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                                        s5 = peg$c10;
                                                                                                                                                        peg$currPos++;
                                                                                                                                                      } else {
                                                                                                                                                        s5 = peg$FAILED;
                                                                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                                      }
                                                                                                                                                      if (s5 !== peg$FAILED) {
                                                                                                                                                        s6 = peg$parse_();
                                                                                                                                                        if (s6 !== peg$FAILED) {
                                                                                                                                                          s7 = peg$parseLabelRef();
                                                                                                                                                          if (s7 !== peg$FAILED) {
                                                                                                                                                            peg$savedPos = s0;
                                                                                                                                                            s1 = peg$c44(s1, s3, s7);
                                                                                                                                                            s0 = s1;
                                                                                                                                                          } else {
                                                                                                                                                            peg$currPos = s0;
                                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                                          }
                                                                                                                                                        } else {
                                                                                                                                                          peg$currPos = s0;
                                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                                        }
                                                                                                                                                      } else {
                                                                                                                                                        peg$currPos = s0;
                                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                                      }
                                                                                                                                                    } else {
                                                                                                                                                      peg$currPos = s0;
                                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                                    }
                                                                                                                                                  } else {
                                                                                                                                                    peg$currPos = s0;
                                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                                  }
                                                                                                                                                } else {
                                                                                                                                                  peg$currPos = s0;
                                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                                }
                                                                                                                                              } else {
                                                                                                                                                peg$currPos = s0;
                                                                                                                                                s0 = peg$FAILED;
                                                                                                                                              }
                                                                                                                                              if (s0 === peg$FAILED) {
                                                                                                                                                s0 = peg$currPos;
                                                                                                                                                if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                                                                                  s1 = peg$c36;
                                                                                                                                                  peg$currPos += 3;
                                                                                                                                                } else {
                                                                                                                                                  s1 = peg$FAILED;
                                                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                                                                                }
                                                                                                                                                if (s1 !== peg$FAILED) {
                                                                                                                                                  s2 = peg$parse_();
                                                                                                                                                  if (s2 !== peg$FAILED) {
                                                                                                                                                    s3 = peg$parseReg();
                                                                                                                                                    if (s3 !== peg$FAILED) {
                                                                                                                                                      s4 = peg$parse_();
                                                                                                                                                      if (s4 !== peg$FAILED) {
                                                                                                                                                        if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                                          s5 = peg$c10;
                                                                                                                                                          peg$currPos++;
                                                                                                                                                        } else {
                                                                                                                                                          s5 = peg$FAILED;
                                                                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                                        }
                                                                                                                                                        if (s5 !== peg$FAILED) {
                                                                                                                                                          s6 = peg$parse_();
                                                                                                                                                          if (s6 !== peg$FAILED) {
                                                                                                                                                            s7 = peg$parseLabelRef();
                                                                                                                                                            if (s7 !== peg$FAILED) {
                                                                                                                                                              peg$savedPos = s0;
                                                                                                                                                              s1 = peg$c44(s1, s3, s7);
                                                                                                                                                              s0 = s1;
                                                                                                                                                            } else {
                                                                                                                                                              peg$currPos = s0;
                                                                                                                                                              s0 = peg$FAILED;
                                                                                                                                                            }
                                                                                                                                                          } else {
                                                                                                                                                            peg$currPos = s0;
                                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                                          }
                                                                                                                                                        } else {
                                                                                                                                                          peg$currPos = s0;
                                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                                        }
                                                                                                                                                      } else {
                                                                                                                                                        peg$currPos = s0;
                                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                                      }
                                                                                                                                                    } else {
                                                                                                                                                      peg$currPos = s0;
                                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                                    }
                                                                                                                                                  } else {
                                                                                                                                                    peg$currPos = s0;
                                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                                  }
                                                                                                                                                } else {
                                                                                                                                                  peg$currPos = s0;
                                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                                }
                                                                                                                                                if (s0 === peg$FAILED) {
                                                                                                                                                  s0 = peg$currPos;
                                                                                                                                                  if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                                                                                    s1 = peg$c36;
                                                                                                                                                    peg$currPos += 3;
                                                                                                                                                  } else {
                                                                                                                                                    s1 = peg$FAILED;
                                                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                                                                                  }
                                                                                                                                                  if (s1 !== peg$FAILED) {
                                                                                                                                                    s2 = peg$parse_();
                                                                                                                                                    if (s2 !== peg$FAILED) {
                                                                                                                                                      s3 = peg$parseLabelRef();
                                                                                                                                                      if (s3 !== peg$FAILED) {
                                                                                                                                                        s4 = peg$parse_();
                                                                                                                                                        if (s4 !== peg$FAILED) {
                                                                                                                                                          if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                                            s5 = peg$c10;
                                                                                                                                                            peg$currPos++;
                                                                                                                                                          } else {
                                                                                                                                                            s5 = peg$FAILED;
                                                                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                                          }
                                                                                                                                                          if (s5 !== peg$FAILED) {
                                                                                                                                                            s6 = peg$parse_();
                                                                                                                                                            if (s6 !== peg$FAILED) {
                                                                                                                                                              s7 = peg$parseReg();
                                                                                                                                                              if (s7 !== peg$FAILED) {
                                                                                                                                                                peg$savedPos = s0;
                                                                                                                                                                s1 = peg$c45(s1, s3, s7);
                                                                                                                                                                s0 = s1;
                                                                                                                                                              } else {
                                                                                                                                                                peg$currPos = s0;
                                                                                                                                                                s0 = peg$FAILED;
                                                                                                                                                              }
                                                                                                                                                            } else {
                                                                                                                                                              peg$currPos = s0;
                                                                                                                                                              s0 = peg$FAILED;
                                                                                                                                                            }
                                                                                                                                                          } else {
                                                                                                                                                            peg$currPos = s0;
                                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                                          }
                                                                                                                                                        } else {
                                                                                                                                                          peg$currPos = s0;
                                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                                        }
                                                                                                                                                      } else {
                                                                                                                                                        peg$currPos = s0;
                                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                                      }
                                                                                                                                                    } else {
                                                                                                                                                      peg$currPos = s0;
                                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                                    }
                                                                                                                                                  } else {
                                                                                                                                                    peg$currPos = s0;
                                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                                  }
                                                                                                                                                  if (s0 === peg$FAILED) {
                                                                                                                                                    s0 = peg$currPos;
                                                                                                                                                    if (input.substr(peg$currPos, 3) === peg$c36) {
                                                                                                                                                      s1 = peg$c36;
                                                                                                                                                      peg$currPos += 3;
                                                                                                                                                    } else {
                                                                                                                                                      s1 = peg$FAILED;
                                                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c37); }
                                                                                                                                                    }
                                                                                                                                                    if (s1 !== peg$FAILED) {
                                                                                                                                                      s2 = peg$parse_();
                                                                                                                                                      if (s2 !== peg$FAILED) {
                                                                                                                                                        s3 = peg$parseLabelRef();
                                                                                                                                                        if (s3 !== peg$FAILED) {
                                                                                                                                                          s4 = peg$parse_();
                                                                                                                                                          if (s4 !== peg$FAILED) {
                                                                                                                                                            if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                                              s5 = peg$c10;
                                                                                                                                                              peg$currPos++;
                                                                                                                                                            } else {
                                                                                                                                                              s5 = peg$FAILED;
                                                                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                                            }
                                                                                                                                                            if (s5 !== peg$FAILED) {
                                                                                                                                                              s6 = peg$parse_();
                                                                                                                                                              if (s6 !== peg$FAILED) {
                                                                                                                                                                s7 = peg$parseInt();
                                                                                                                                                                if (s7 !== peg$FAILED) {
                                                                                                                                                                  peg$savedPos = s0;
                                                                                                                                                                  s1 = peg$c46(s1, s3, s7);
                                                                                                                                                                  s0 = s1;
                                                                                                                                                                } else {
                                                                                                                                                                  peg$currPos = s0;
                                                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                                                }
                                                                                                                                                              } else {
                                                                                                                                                                peg$currPos = s0;
                                                                                                                                                                s0 = peg$FAILED;
                                                                                                                                                              }
                                                                                                                                                            } else {
                                                                                                                                                              peg$currPos = s0;
                                                                                                                                                              s0 = peg$FAILED;
                                                                                                                                                            }
                                                                                                                                                          } else {
                                                                                                                                                            peg$currPos = s0;
                                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                                          }
                                                                                                                                                        } else {
                                                                                                                                                          peg$currPos = s0;
                                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                                        }
                                                                                                                                                      } else {
                                                                                                                                                        peg$currPos = s0;
                                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                                      }
                                                                                                                                                    } else {
                                                                                                                                                      peg$currPos = s0;
                                                                                                                                                      s0 = peg$FAILED;
                                                                                                                                                    }
                                                                                                                                                    if (s0 === peg$FAILED) {
                                                                                                                                                      s0 = peg$currPos;
                                                                                                                                                      if (input.substr(peg$currPos, 3) === peg$c42) {
                                                                                                                                                        s1 = peg$c42;
                                                                                                                                                        peg$currPos += 3;
                                                                                                                                                      } else {
                                                                                                                                                        s1 = peg$FAILED;
                                                                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c43); }
                                                                                                                                                      }
                                                                                                                                                      if (s1 !== peg$FAILED) {
                                                                                                                                                        s2 = peg$parse_();
                                                                                                                                                        if (s2 !== peg$FAILED) {
                                                                                                                                                          s3 = peg$parseReg();
                                                                                                                                                          if (s3 !== peg$FAILED) {
                                                                                                                                                            s4 = peg$parse_();
                                                                                                                                                            if (s4 !== peg$FAILED) {
                                                                                                                                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                                                                s5 = peg$c10;
                                                                                                                                                                peg$currPos++;
                                                                                                                                                              } else {
                                                                                                                                                                s5 = peg$FAILED;
                                                                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c11); }
                                                                                                                                                              }
                                                                                                                                                              if (s5 !== peg$FAILED) {
                                                                                                                                                                s6 = peg$parse_();
                                                                                                                                                                if (s6 !== peg$FAILED) {
                                                                                                                                                                  s7 = peg$parseLabelRef();
                                                                                                                                                                  if (s7 !== peg$FAILED) {
                                                                                                                                                                    peg$savedPos = s0;
                                                                                                                                                                    s1 = peg$c44(s1, s3, s7);
                                                                                                                                                                    s0 = s1;
                                                                                                                                                                  } else {
                                                                                                                                                                    peg$currPos = s0;
                                                                                                                                                                    s0 = peg$FAILED;
                                                                                                                                                                  }
                                                                                                                                                                } else {
                                                                                                                                                                  peg$currPos = s0;
                                                                                                                                                                  s0 = peg$FAILED;
                                                                                                                                                                }
                                                                                                                                                              } else {
                                                                                                                                                                peg$currPos = s0;
                                                                                                                                                                s0 = peg$FAILED;
                                                                                                                                                              }
                                                                                                                                                            } else {
                                                                                                                                                              peg$currPos = s0;
                                                                                                                                                              s0 = peg$FAILED;
                                                                                                                                                            }
                                                                                                                                                          } else {
                                                                                                                                                            peg$currPos = s0;
                                                                                                                                                            s0 = peg$FAILED;
                                                                                                                                                          }
                                                                                                                                                        } else {
                                                                                                                                                          peg$currPos = s0;
                                                                                                                                                          s0 = peg$FAILED;
                                                                                                                                                        }
                                                                                                                                                      } else {
                                                                                                                                                        peg$currPos = s0;
                                                                                                                                                        s0 = peg$FAILED;
                                                                                                                                                      }
                                                                                                                                                    }
                                                                                                                                                  }
                                                                                                                                                }
                                                                                                                                              }
                                                                                                                                            }
                                                                                                                                          }
                                                                                                                                        }
                                                                                                                                      }
                                                                                                                                    }
                                                                                                                                  }
                                                                                                                                }
                                                                                                                              }
                                                                                                                            }
                                                                                                                          }
                                                                                                                        }
                                                                                                                      }
                                                                                                                    }
                                                                                                                  }
                                                                                                                }
                                                                                                              }
                                                                                                            }
                                                                                                          }
                                                                                                        }
                                                                                                      }
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    }
                                                                                  }
                                                                                }
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c13); }
    }

    return s0;
  }

  function peg$parseOneArgIns() {
    var s0, s1, s2, s3;

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3) === peg$c48) {
      s1 = peg$c48;
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c49); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 3) === peg$c50) {
        s1 = peg$c50;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c51); }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseReg();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c52(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 4) === peg$c53) {
        s1 = peg$c53;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c54); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parse_();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseReg();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c52(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 4) === peg$c53) {
          s1 = peg$c53;
          peg$currPos += 4;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c54); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseRegAddr();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c55(s1, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 4) === peg$c53) {
            s1 = peg$c53;
            peg$currPos += 4;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c54); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parse_();
            if (s2 !== peg$FAILED) {
              s3 = peg$parseConstAddr();
              if (s3 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c56(s1, s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 4) === peg$c53) {
              s1 = peg$c53;
              peg$currPos += 4;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c54); }
            }
            if (s1 !== peg$FAILED) {
              s2 = peg$parse_();
              if (s2 !== peg$FAILED) {
                s3 = peg$parseLabelRef();
                if (s3 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c57(s1, s3);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.substr(peg$currPos, 4) === peg$c53) {
                s1 = peg$c53;
                peg$currPos += 4;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c54); }
              }
              if (s1 !== peg$FAILED) {
                s2 = peg$parse_();
                if (s2 !== peg$FAILED) {
                  s3 = peg$parseLabelAddr();
                  if (s3 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c56(s1, s3);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.substr(peg$currPos, 4) === peg$c53) {
                  s1 = peg$c53;
                  peg$currPos += 4;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c54); }
                }
                if (s1 !== peg$FAILED) {
                  s2 = peg$parse_();
                  if (s2 !== peg$FAILED) {
                    s3 = peg$parseInt();
                    if (s3 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c58(s1, s3);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  if (input.substr(peg$currPos, 3) === peg$c59) {
                    s1 = peg$c59;
                    peg$currPos += 3;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c60); }
                  }
                  if (s1 !== peg$FAILED) {
                    s2 = peg$parse_();
                    if (s2 !== peg$FAILED) {
                      s3 = peg$parseReg();
                      if (s3 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c52(s1, s3);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                  if (s0 === peg$FAILED) {
                    s0 = peg$currPos;
                    if (input.substr(peg$currPos, 3) === peg$c61) {
                      s1 = peg$c61;
                      peg$currPos += 3;
                    } else {
                      s1 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c62); }
                    }
                    if (s1 !== peg$FAILED) {
                      s2 = peg$parse_();
                      if (s2 !== peg$FAILED) {
                        s3 = peg$parseRegAddr();
                        if (s3 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c63(s1, s3);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                    if (s0 === peg$FAILED) {
                      s0 = peg$currPos;
                      if (input.substr(peg$currPos, 3) === peg$c61) {
                        s1 = peg$c61;
                        peg$currPos += 3;
                      } else {
                        s1 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c62); }
                      }
                      if (s1 !== peg$FAILED) {
                        s2 = peg$parse_();
                        if (s2 !== peg$FAILED) {
                          s3 = peg$parseConstAddr();
                          if (s3 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c64(s1, s3);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                      if (s0 === peg$FAILED) {
                        s0 = peg$currPos;
                        if (input.substr(peg$currPos, 3) === peg$c61) {
                          s1 = peg$c61;
                          peg$currPos += 3;
                        } else {
                          s1 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c62); }
                        }
                        if (s1 !== peg$FAILED) {
                          s2 = peg$parse_();
                          if (s2 !== peg$FAILED) {
                            s3 = peg$parseLabelRef();
                            if (s3 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c57(s1, s3);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                        if (s0 === peg$FAILED) {
                          s0 = peg$currPos;
                          if (input.substr(peg$currPos, 3) === peg$c61) {
                            s1 = peg$c61;
                            peg$currPos += 3;
                          } else {
                            s1 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c62); }
                          }
                          if (s1 !== peg$FAILED) {
                            s2 = peg$parse_();
                            if (s2 !== peg$FAILED) {
                              s3 = peg$parseLabelAddr();
                              if (s3 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c56(s1, s3);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                          if (s0 === peg$FAILED) {
                            s0 = peg$currPos;
                            if (input.substr(peg$currPos, 3) === peg$c61) {
                              s1 = peg$c61;
                              peg$currPos += 3;
                            } else {
                              s1 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c62); }
                            }
                            if (s1 !== peg$FAILED) {
                              s2 = peg$parse_();
                              if (s2 !== peg$FAILED) {
                                s3 = peg$parseInt();
                                if (s3 !== peg$FAILED) {
                                  peg$savedPos = s0;
                                  s1 = peg$c65(s1, s3);
                                  s0 = s1;
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                            if (s0 === peg$FAILED) {
                              s0 = peg$currPos;
                              if (input.substr(peg$currPos, 2) === peg$c66) {
                                s1 = peg$c66;
                                peg$currPos += 2;
                              } else {
                                s1 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c67); }
                              }
                              if (s1 !== peg$FAILED) {
                                s2 = peg$parse_();
                                if (s2 !== peg$FAILED) {
                                  s3 = peg$parseRegAddr();
                                  if (s3 !== peg$FAILED) {
                                    peg$savedPos = s0;
                                    s1 = peg$c63(s1, s3);
                                    s0 = s1;
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                              if (s0 === peg$FAILED) {
                                s0 = peg$currPos;
                                if (input.substr(peg$currPos, 2) === peg$c66) {
                                  s1 = peg$c66;
                                  peg$currPos += 2;
                                } else {
                                  s1 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c67); }
                                }
                                if (s1 !== peg$FAILED) {
                                  s2 = peg$parse_();
                                  if (s2 !== peg$FAILED) {
                                    s3 = peg$parseConstAddr();
                                    if (s3 !== peg$FAILED) {
                                      peg$savedPos = s0;
                                      s1 = peg$c64(s1, s3);
                                      s0 = s1;
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                                if (s0 === peg$FAILED) {
                                  s0 = peg$currPos;
                                  if (input.substr(peg$currPos, 2) === peg$c66) {
                                    s1 = peg$c66;
                                    peg$currPos += 2;
                                  } else {
                                    s1 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c67); }
                                  }
                                  if (s1 !== peg$FAILED) {
                                    s2 = peg$parse_();
                                    if (s2 !== peg$FAILED) {
                                      s3 = peg$parseLabelRef();
                                      if (s3 !== peg$FAILED) {
                                        peg$savedPos = s0;
                                        s1 = peg$c68(s1, s3);
                                        s0 = s1;
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                  if (s0 === peg$FAILED) {
                                    s0 = peg$currPos;
                                    if (input.substr(peg$currPos, 2) === peg$c66) {
                                      s1 = peg$c66;
                                      peg$currPos += 2;
                                    } else {
                                      s1 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c67); }
                                    }
                                    if (s1 !== peg$FAILED) {
                                      s2 = peg$parse_();
                                      if (s2 !== peg$FAILED) {
                                        s3 = peg$parseLabelAddr();
                                        if (s3 !== peg$FAILED) {
                                          peg$savedPos = s0;
                                          s1 = peg$c56(s1, s3);
                                          s0 = s1;
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                    if (s0 === peg$FAILED) {
                                      s0 = peg$currPos;
                                      if (input.substr(peg$currPos, 2) === peg$c66) {
                                        s1 = peg$c66;
                                        peg$currPos += 2;
                                      } else {
                                        s1 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c67); }
                                      }
                                      if (s1 !== peg$FAILED) {
                                        s2 = peg$parse_();
                                        if (s2 !== peg$FAILED) {
                                          s3 = peg$parseInt();
                                          if (s3 !== peg$FAILED) {
                                            peg$savedPos = s0;
                                            s1 = peg$c65(s1, s3);
                                            s0 = s1;
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                      if (s0 === peg$FAILED) {
                                        s0 = peg$currPos;
                                        if (input.substr(peg$currPos, 3) === peg$c69) {
                                          s1 = peg$c69;
                                          peg$currPos += 3;
                                        } else {
                                          s1 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c70); }
                                        }
                                        if (s1 !== peg$FAILED) {
                                          s2 = peg$parse_();
                                          if (s2 !== peg$FAILED) {
                                            s3 = peg$parseRegAddr();
                                            if (s3 !== peg$FAILED) {
                                              peg$savedPos = s0;
                                              s1 = peg$c63(s1, s3);
                                              s0 = s1;
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                        if (s0 === peg$FAILED) {
                                          s0 = peg$currPos;
                                          if (input.substr(peg$currPos, 3) === peg$c69) {
                                            s1 = peg$c69;
                                            peg$currPos += 3;
                                          } else {
                                            s1 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c70); }
                                          }
                                          if (s1 !== peg$FAILED) {
                                            s2 = peg$parse_();
                                            if (s2 !== peg$FAILED) {
                                              s3 = peg$parseConstAddr();
                                              if (s3 !== peg$FAILED) {
                                                peg$savedPos = s0;
                                                s1 = peg$c64(s1, s3);
                                                s0 = s1;
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                          if (s0 === peg$FAILED) {
                                            s0 = peg$currPos;
                                            if (input.substr(peg$currPos, 3) === peg$c69) {
                                              s1 = peg$c69;
                                              peg$currPos += 3;
                                            } else {
                                              s1 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c70); }
                                            }
                                            if (s1 !== peg$FAILED) {
                                              s2 = peg$parse_();
                                              if (s2 !== peg$FAILED) {
                                                s3 = peg$parseLabelRef();
                                                if (s3 !== peg$FAILED) {
                                                  peg$savedPos = s0;
                                                  s1 = peg$c68(s1, s3);
                                                  s0 = s1;
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                            if (s0 === peg$FAILED) {
                                              s0 = peg$currPos;
                                              if (input.substr(peg$currPos, 3) === peg$c69) {
                                                s1 = peg$c69;
                                                peg$currPos += 3;
                                              } else {
                                                s1 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c70); }
                                              }
                                              if (s1 !== peg$FAILED) {
                                                s2 = peg$parse_();
                                                if (s2 !== peg$FAILED) {
                                                  s3 = peg$parseLabelAddr();
                                                  if (s3 !== peg$FAILED) {
                                                    peg$savedPos = s0;
                                                    s1 = peg$c56(s1, s3);
                                                    s0 = s1;
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                              if (s0 === peg$FAILED) {
                                                s0 = peg$currPos;
                                                if (input.substr(peg$currPos, 3) === peg$c69) {
                                                  s1 = peg$c69;
                                                  peg$currPos += 3;
                                                } else {
                                                  s1 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c70); }
                                                }
                                                if (s1 !== peg$FAILED) {
                                                  s2 = peg$parse_();
                                                  if (s2 !== peg$FAILED) {
                                                    s3 = peg$parseInt();
                                                    if (s3 !== peg$FAILED) {
                                                      peg$savedPos = s0;
                                                      s1 = peg$c65(s1, s3);
                                                      s0 = s1;
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                                if (s0 === peg$FAILED) {
                                                  s0 = peg$currPos;
                                                  if (input.substr(peg$currPos, 2) === peg$c71) {
                                                    s1 = peg$c71;
                                                    peg$currPos += 2;
                                                  } else {
                                                    s1 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c72); }
                                                  }
                                                  if (s1 !== peg$FAILED) {
                                                    s2 = peg$parse_();
                                                    if (s2 !== peg$FAILED) {
                                                      s3 = peg$parseRegAddr();
                                                      if (s3 !== peg$FAILED) {
                                                        peg$savedPos = s0;
                                                        s1 = peg$c63(s1, s3);
                                                        s0 = s1;
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                  if (s0 === peg$FAILED) {
                                                    s0 = peg$currPos;
                                                    if (input.substr(peg$currPos, 2) === peg$c71) {
                                                      s1 = peg$c71;
                                                      peg$currPos += 2;
                                                    } else {
                                                      s1 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c72); }
                                                    }
                                                    if (s1 !== peg$FAILED) {
                                                      s2 = peg$parse_();
                                                      if (s2 !== peg$FAILED) {
                                                        s3 = peg$parseConstAddr();
                                                        if (s3 !== peg$FAILED) {
                                                          peg$savedPos = s0;
                                                          s1 = peg$c64(s1, s3);
                                                          s0 = s1;
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                    if (s0 === peg$FAILED) {
                                                      s0 = peg$currPos;
                                                      if (input.substr(peg$currPos, 2) === peg$c71) {
                                                        s1 = peg$c71;
                                                        peg$currPos += 2;
                                                      } else {
                                                        s1 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c72); }
                                                      }
                                                      if (s1 !== peg$FAILED) {
                                                        s2 = peg$parse_();
                                                        if (s2 !== peg$FAILED) {
                                                          s3 = peg$parseLabelRef();
                                                          if (s3 !== peg$FAILED) {
                                                            peg$savedPos = s0;
                                                            s1 = peg$c68(s1, s3);
                                                            s0 = s1;
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                      if (s0 === peg$FAILED) {
                                                        s0 = peg$currPos;
                                                        if (input.substr(peg$currPos, 2) === peg$c71) {
                                                          s1 = peg$c71;
                                                          peg$currPos += 2;
                                                        } else {
                                                          s1 = peg$FAILED;
                                                          if (peg$silentFails === 0) { peg$fail(peg$c72); }
                                                        }
                                                        if (s1 !== peg$FAILED) {
                                                          s2 = peg$parse_();
                                                          if (s2 !== peg$FAILED) {
                                                            s3 = peg$parseLabelAddr();
                                                            if (s3 !== peg$FAILED) {
                                                              peg$savedPos = s0;
                                                              s1 = peg$c56(s1, s3);
                                                              s0 = s1;
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                        if (s0 === peg$FAILED) {
                                                          s0 = peg$currPos;
                                                          if (input.substr(peg$currPos, 2) === peg$c71) {
                                                            s1 = peg$c71;
                                                            peg$currPos += 2;
                                                          } else {
                                                            s1 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c72); }
                                                          }
                                                          if (s1 !== peg$FAILED) {
                                                            s2 = peg$parse_();
                                                            if (s2 !== peg$FAILED) {
                                                              s3 = peg$parseInt();
                                                              if (s3 !== peg$FAILED) {
                                                                peg$savedPos = s0;
                                                                s1 = peg$c65(s1, s3);
                                                                s0 = s1;
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                          if (s0 === peg$FAILED) {
                                                            s0 = peg$currPos;
                                                            if (input.substr(peg$currPos, 3) === peg$c73) {
                                                              s1 = peg$c73;
                                                              peg$currPos += 3;
                                                            } else {
                                                              s1 = peg$FAILED;
                                                              if (peg$silentFails === 0) { peg$fail(peg$c74); }
                                                            }
                                                            if (s1 !== peg$FAILED) {
                                                              s2 = peg$parse_();
                                                              if (s2 !== peg$FAILED) {
                                                                s3 = peg$parseRegAddr();
                                                                if (s3 !== peg$FAILED) {
                                                                  peg$savedPos = s0;
                                                                  s1 = peg$c63(s1, s3);
                                                                  s0 = s1;
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                            if (s0 === peg$FAILED) {
                                                              s0 = peg$currPos;
                                                              if (input.substr(peg$currPos, 3) === peg$c73) {
                                                                s1 = peg$c73;
                                                                peg$currPos += 3;
                                                              } else {
                                                                s1 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c74); }
                                                              }
                                                              if (s1 !== peg$FAILED) {
                                                                s2 = peg$parse_();
                                                                if (s2 !== peg$FAILED) {
                                                                  s3 = peg$parseConstAddr();
                                                                  if (s3 !== peg$FAILED) {
                                                                    peg$savedPos = s0;
                                                                    s1 = peg$c64(s1, s3);
                                                                    s0 = s1;
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                              if (s0 === peg$FAILED) {
                                                                s0 = peg$currPos;
                                                                if (input.substr(peg$currPos, 3) === peg$c73) {
                                                                  s1 = peg$c73;
                                                                  peg$currPos += 3;
                                                                } else {
                                                                  s1 = peg$FAILED;
                                                                  if (peg$silentFails === 0) { peg$fail(peg$c74); }
                                                                }
                                                                if (s1 !== peg$FAILED) {
                                                                  s2 = peg$parse_();
                                                                  if (s2 !== peg$FAILED) {
                                                                    s3 = peg$parseLabelRef();
                                                                    if (s3 !== peg$FAILED) {
                                                                      peg$savedPos = s0;
                                                                      s1 = peg$c68(s1, s3);
                                                                      s0 = s1;
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                                if (s0 === peg$FAILED) {
                                                                  s0 = peg$currPos;
                                                                  if (input.substr(peg$currPos, 3) === peg$c73) {
                                                                    s1 = peg$c73;
                                                                    peg$currPos += 3;
                                                                  } else {
                                                                    s1 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c74); }
                                                                  }
                                                                  if (s1 !== peg$FAILED) {
                                                                    s2 = peg$parse_();
                                                                    if (s2 !== peg$FAILED) {
                                                                      s3 = peg$parseLabelAddr();
                                                                      if (s3 !== peg$FAILED) {
                                                                        peg$savedPos = s0;
                                                                        s1 = peg$c56(s1, s3);
                                                                        s0 = s1;
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                  if (s0 === peg$FAILED) {
                                                                    s0 = peg$currPos;
                                                                    if (input.substr(peg$currPos, 3) === peg$c73) {
                                                                      s1 = peg$c73;
                                                                      peg$currPos += 3;
                                                                    } else {
                                                                      s1 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c74); }
                                                                    }
                                                                    if (s1 !== peg$FAILED) {
                                                                      s2 = peg$parse_();
                                                                      if (s2 !== peg$FAILED) {
                                                                        s3 = peg$parseInt();
                                                                        if (s3 !== peg$FAILED) {
                                                                          peg$savedPos = s0;
                                                                          s1 = peg$c65(s1, s3);
                                                                          s0 = s1;
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                    if (s0 === peg$FAILED) {
                                                                      s0 = peg$currPos;
                                                                      if (input.substr(peg$currPos, 2) === peg$c75) {
                                                                        s1 = peg$c75;
                                                                        peg$currPos += 2;
                                                                      } else {
                                                                        s1 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c76); }
                                                                      }
                                                                      if (s1 !== peg$FAILED) {
                                                                        s2 = peg$parse_();
                                                                        if (s2 !== peg$FAILED) {
                                                                          s3 = peg$parseRegAddr();
                                                                          if (s3 !== peg$FAILED) {
                                                                            peg$savedPos = s0;
                                                                            s1 = peg$c63(s1, s3);
                                                                            s0 = s1;
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                      if (s0 === peg$FAILED) {
                                                                        s0 = peg$currPos;
                                                                        if (input.substr(peg$currPos, 2) === peg$c75) {
                                                                          s1 = peg$c75;
                                                                          peg$currPos += 2;
                                                                        } else {
                                                                          s1 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c76); }
                                                                        }
                                                                        if (s1 !== peg$FAILED) {
                                                                          s2 = peg$parse_();
                                                                          if (s2 !== peg$FAILED) {
                                                                            s3 = peg$parseConstAddr();
                                                                            if (s3 !== peg$FAILED) {
                                                                              peg$savedPos = s0;
                                                                              s1 = peg$c64(s1, s3);
                                                                              s0 = s1;
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                        if (s0 === peg$FAILED) {
                                                                          s0 = peg$currPos;
                                                                          if (input.substr(peg$currPos, 2) === peg$c75) {
                                                                            s1 = peg$c75;
                                                                            peg$currPos += 2;
                                                                          } else {
                                                                            s1 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c76); }
                                                                          }
                                                                          if (s1 !== peg$FAILED) {
                                                                            s2 = peg$parse_();
                                                                            if (s2 !== peg$FAILED) {
                                                                              s3 = peg$parseLabelRef();
                                                                              if (s3 !== peg$FAILED) {
                                                                                peg$savedPos = s0;
                                                                                s1 = peg$c68(s1, s3);
                                                                                s0 = s1;
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                          if (s0 === peg$FAILED) {
                                                                            s0 = peg$currPos;
                                                                            if (input.substr(peg$currPos, 2) === peg$c75) {
                                                                              s1 = peg$c75;
                                                                              peg$currPos += 2;
                                                                            } else {
                                                                              s1 = peg$FAILED;
                                                                              if (peg$silentFails === 0) { peg$fail(peg$c76); }
                                                                            }
                                                                            if (s1 !== peg$FAILED) {
                                                                              s2 = peg$parse_();
                                                                              if (s2 !== peg$FAILED) {
                                                                                s3 = peg$parseLabelAddr();
                                                                                if (s3 !== peg$FAILED) {
                                                                                  peg$savedPos = s0;
                                                                                  s1 = peg$c56(s1, s3);
                                                                                  s0 = s1;
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                            if (s0 === peg$FAILED) {
                                                                              s0 = peg$currPos;
                                                                              if (input.substr(peg$currPos, 2) === peg$c75) {
                                                                                s1 = peg$c75;
                                                                                peg$currPos += 2;
                                                                              } else {
                                                                                s1 = peg$FAILED;
                                                                                if (peg$silentFails === 0) { peg$fail(peg$c76); }
                                                                              }
                                                                              if (s1 !== peg$FAILED) {
                                                                                s2 = peg$parse_();
                                                                                if (s2 !== peg$FAILED) {
                                                                                  s3 = peg$parseInt();
                                                                                  if (s3 !== peg$FAILED) {
                                                                                    peg$savedPos = s0;
                                                                                    s1 = peg$c65(s1, s3);
                                                                                    s0 = s1;
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                              if (s0 === peg$FAILED) {
                                                                                s0 = peg$currPos;
                                                                                if (input.substr(peg$currPos, 3) === peg$c77) {
                                                                                  s1 = peg$c77;
                                                                                  peg$currPos += 3;
                                                                                } else {
                                                                                  s1 = peg$FAILED;
                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c78); }
                                                                                }
                                                                                if (s1 !== peg$FAILED) {
                                                                                  s2 = peg$parse_();
                                                                                  if (s2 !== peg$FAILED) {
                                                                                    s3 = peg$parseRegAddr();
                                                                                    if (s3 !== peg$FAILED) {
                                                                                      peg$savedPos = s0;
                                                                                      s1 = peg$c63(s1, s3);
                                                                                      s0 = s1;
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                                if (s0 === peg$FAILED) {
                                                                                  s0 = peg$currPos;
                                                                                  if (input.substr(peg$currPos, 3) === peg$c77) {
                                                                                    s1 = peg$c77;
                                                                                    peg$currPos += 3;
                                                                                  } else {
                                                                                    s1 = peg$FAILED;
                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c78); }
                                                                                  }
                                                                                  if (s1 !== peg$FAILED) {
                                                                                    s2 = peg$parse_();
                                                                                    if (s2 !== peg$FAILED) {
                                                                                      s3 = peg$parseConstAddr();
                                                                                      if (s3 !== peg$FAILED) {
                                                                                        peg$savedPos = s0;
                                                                                        s1 = peg$c64(s1, s3);
                                                                                        s0 = s1;
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                  if (s0 === peg$FAILED) {
                                                                                    s0 = peg$currPos;
                                                                                    if (input.substr(peg$currPos, 3) === peg$c77) {
                                                                                      s1 = peg$c77;
                                                                                      peg$currPos += 3;
                                                                                    } else {
                                                                                      s1 = peg$FAILED;
                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c78); }
                                                                                    }
                                                                                    if (s1 !== peg$FAILED) {
                                                                                      s2 = peg$parse_();
                                                                                      if (s2 !== peg$FAILED) {
                                                                                        s3 = peg$parseLabelRef();
                                                                                        if (s3 !== peg$FAILED) {
                                                                                          peg$savedPos = s0;
                                                                                          s1 = peg$c68(s1, s3);
                                                                                          s0 = s1;
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                    if (s0 === peg$FAILED) {
                                                                                      s0 = peg$currPos;
                                                                                      if (input.substr(peg$currPos, 3) === peg$c77) {
                                                                                        s1 = peg$c77;
                                                                                        peg$currPos += 3;
                                                                                      } else {
                                                                                        s1 = peg$FAILED;
                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c78); }
                                                                                      }
                                                                                      if (s1 !== peg$FAILED) {
                                                                                        s2 = peg$parse_();
                                                                                        if (s2 !== peg$FAILED) {
                                                                                          s3 = peg$parseLabelAddr();
                                                                                          if (s3 !== peg$FAILED) {
                                                                                            peg$savedPos = s0;
                                                                                            s1 = peg$c56(s1, s3);
                                                                                            s0 = s1;
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                      if (s0 === peg$FAILED) {
                                                                                        s0 = peg$currPos;
                                                                                        if (input.substr(peg$currPos, 3) === peg$c77) {
                                                                                          s1 = peg$c77;
                                                                                          peg$currPos += 3;
                                                                                        } else {
                                                                                          s1 = peg$FAILED;
                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c78); }
                                                                                        }
                                                                                        if (s1 !== peg$FAILED) {
                                                                                          s2 = peg$parse_();
                                                                                          if (s2 !== peg$FAILED) {
                                                                                            s3 = peg$parseInt();
                                                                                            if (s3 !== peg$FAILED) {
                                                                                              peg$savedPos = s0;
                                                                                              s1 = peg$c65(s1, s3);
                                                                                              s0 = s1;
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                        if (s0 === peg$FAILED) {
                                                                                          s0 = peg$currPos;
                                                                                          if (input.substr(peg$currPos, 4) === peg$c79) {
                                                                                            s1 = peg$c79;
                                                                                            peg$currPos += 4;
                                                                                          } else {
                                                                                            s1 = peg$FAILED;
                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c80); }
                                                                                          }
                                                                                          if (s1 !== peg$FAILED) {
                                                                                            s2 = peg$parse_();
                                                                                            if (s2 !== peg$FAILED) {
                                                                                              s3 = peg$parseRegAddr();
                                                                                              if (s3 !== peg$FAILED) {
                                                                                                peg$savedPos = s0;
                                                                                                s1 = peg$c63(s1, s3);
                                                                                                s0 = s1;
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                          if (s0 === peg$FAILED) {
                                                                                            s0 = peg$currPos;
                                                                                            if (input.substr(peg$currPos, 4) === peg$c79) {
                                                                                              s1 = peg$c79;
                                                                                              peg$currPos += 4;
                                                                                            } else {
                                                                                              s1 = peg$FAILED;
                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c80); }
                                                                                            }
                                                                                            if (s1 !== peg$FAILED) {
                                                                                              s2 = peg$parse_();
                                                                                              if (s2 !== peg$FAILED) {
                                                                                                s3 = peg$parseConstAddr();
                                                                                                if (s3 !== peg$FAILED) {
                                                                                                  peg$savedPos = s0;
                                                                                                  s1 = peg$c64(s1, s3);
                                                                                                  s0 = s1;
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                            if (s0 === peg$FAILED) {
                                                                                              s0 = peg$currPos;
                                                                                              if (input.substr(peg$currPos, 4) === peg$c79) {
                                                                                                s1 = peg$c79;
                                                                                                peg$currPos += 4;
                                                                                              } else {
                                                                                                s1 = peg$FAILED;
                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c80); }
                                                                                              }
                                                                                              if (s1 !== peg$FAILED) {
                                                                                                s2 = peg$parse_();
                                                                                                if (s2 !== peg$FAILED) {
                                                                                                  s3 = peg$parseLabelRef();
                                                                                                  if (s3 !== peg$FAILED) {
                                                                                                    peg$savedPos = s0;
                                                                                                    s1 = peg$c68(s1, s3);
                                                                                                    s0 = s1;
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                              if (s0 === peg$FAILED) {
                                                                                                s0 = peg$currPos;
                                                                                                if (input.substr(peg$currPos, 4) === peg$c79) {
                                                                                                  s1 = peg$c79;
                                                                                                  peg$currPos += 4;
                                                                                                } else {
                                                                                                  s1 = peg$FAILED;
                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c80); }
                                                                                                }
                                                                                                if (s1 !== peg$FAILED) {
                                                                                                  s2 = peg$parse_();
                                                                                                  if (s2 !== peg$FAILED) {
                                                                                                    s3 = peg$parseLabelAddr();
                                                                                                    if (s3 !== peg$FAILED) {
                                                                                                      peg$savedPos = s0;
                                                                                                      s1 = peg$c56(s1, s3);
                                                                                                      s0 = s1;
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                                if (s0 === peg$FAILED) {
                                                                                                  s0 = peg$currPos;
                                                                                                  if (input.substr(peg$currPos, 4) === peg$c79) {
                                                                                                    s1 = peg$c79;
                                                                                                    peg$currPos += 4;
                                                                                                  } else {
                                                                                                    s1 = peg$FAILED;
                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c80); }
                                                                                                  }
                                                                                                  if (s1 !== peg$FAILED) {
                                                                                                    s2 = peg$parse_();
                                                                                                    if (s2 !== peg$FAILED) {
                                                                                                      s3 = peg$parseInt();
                                                                                                      if (s3 !== peg$FAILED) {
                                                                                                        peg$savedPos = s0;
                                                                                                        s1 = peg$c65(s1, s3);
                                                                                                        s0 = s1;
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                  if (s0 === peg$FAILED) {
                                                                                                    s0 = peg$currPos;
                                                                                                    if (input.substr(peg$currPos, 3) === peg$c81) {
                                                                                                      s1 = peg$c81;
                                                                                                      peg$currPos += 3;
                                                                                                    } else {
                                                                                                      s1 = peg$FAILED;
                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c82); }
                                                                                                    }
                                                                                                    if (s1 !== peg$FAILED) {
                                                                                                      s2 = peg$parse_();
                                                                                                      if (s2 !== peg$FAILED) {
                                                                                                        s3 = peg$parseInt();
                                                                                                        if (s3 !== peg$FAILED) {
                                                                                                          peg$savedPos = s0;
                                                                                                          s1 = peg$c65(s1, s3);
                                                                                                          s0 = s1;
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    }
                                                                                  }
                                                                                }
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c47); }
    }

    return s0;
  }

  function peg$parseSingleIns() {
    var s0, s1;

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3) === peg$c84) {
      s1 = peg$c84;
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c85); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 3) === peg$c86) {
        s1 = peg$c86;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c87); }
      }
      if (s1 === peg$FAILED) {
        if (input.substr(peg$currPos, 3) === peg$c88) {
          s1 = peg$c88;
          peg$currPos += 3;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c89); }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c90(s1);
    }
    s0 = s1;
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c83); }
    }

    return s0;
  }

  function peg$parseLabelAddr() {
    var s0, s1, s2, s3, s4, s5;

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 91) {
      s1 = peg$c92;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c93); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseLabelRef();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 93) {
              s5 = peg$c94;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c95); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c96(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c91); }
    }

    return s0;
  }

  function peg$parseConstAddr() {
    var s0, s1, s2, s3, s4, s5;

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 91) {
      s1 = peg$c92;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c93); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseInt();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 93) {
              s5 = peg$c94;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c95); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c96(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c97); }
    }

    return s0;
  }

  function peg$parseRegAddr() {
    var s0, s1, s2, s3, s4, s5;

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 91) {
      s1 = peg$c92;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c93); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parse_();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseReg();
        if (s3 !== peg$FAILED) {
          s4 = peg$parse_();
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 93) {
              s5 = peg$c94;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c95); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c96(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c98); }
    }

    return s0;
  }

  function peg$parseReg() {
    var s0, s1, s2, s3;

    peg$silentFails++;
    s0 = peg$currPos;
    if (peg$c100.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c101); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c102();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$currPos;
      if (peg$c103.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c104); }
      }
      if (s2 !== peg$FAILED) {
        if (peg$c105.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c106); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s2 = [s2, s3];
          s1 = s2;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c102();
      }
      s0 = s1;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c99); }
    }

    return s0;
  }

  function peg$parseLabelRef() {
    var s0, s1, s2, s3;

    peg$silentFails++;
    s0 = peg$currPos;
    if (peg$c108.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c109); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c110.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c111); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c110.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c111); }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c112(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c107); }
    }

    return s0;
  }

  function peg$parseLabel() {
    var s0, s1, s2;

    peg$silentFails++;
    s0 = peg$currPos;
    s1 = peg$parseLabelRef();
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 58) {
        s2 = peg$c114;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c115); }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c116(s1);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c113); }
    }

    return s0;
  }

  function peg$parseString() {
    var s0, s1, s2, s3;

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 34) {
      s1 = peg$c118;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c119); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c120.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c121); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c120.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c121); }
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 34) {
          s3 = peg$c118;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c119); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c122(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c117); }
    }

    return s0;
  }

  function peg$parseInt() {
    var s0, s1;

    peg$silentFails++;
    s0 = peg$parseBinInt();
    if (s0 === peg$FAILED) {
      s0 = peg$parseHexInt();
      if (s0 === peg$FAILED) {
        s0 = peg$parseDecInt();
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c123); }
    }

    return s0;
  }

  function peg$parseBinInt() {
    var s0, s1, s2, s3;

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c125) {
      s1 = peg$c125;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c126); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c127.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c128); }
      }
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$c127.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c128); }
          }
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c129(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c124); }
    }

    return s0;
  }

  function peg$parseHexInt() {
    var s0, s1, s2, s3;

    peg$silentFails++;
    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c131) {
      s1 = peg$c131;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c132); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c133.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c134); }
      }
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$c133.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c134); }
          }
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c135();
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c130); }
    }

    return s0;
  }

  function peg$parseDecInt() {
    var s0, s1, s2;

    peg$silentFails++;
    s0 = peg$currPos;
    s1 = [];
    if (peg$c137.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c138); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c137.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c138); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c139();
    }
    s0 = s1;
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c136); }
    }

    return s0;
  }

  function peg$parseNL() {
    var s0, s1;

    peg$silentFails++;
    s0 = [];
    if (peg$c141.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c142); }
    }
    while (s1 !== peg$FAILED) {
      s0.push(s1);
      if (peg$c141.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c142); }
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c140); }
    }

    return s0;
  }

  function peg$parse_() {
    var s0, s1;

    peg$silentFails++;
    s0 = [];
    if (peg$c144.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c145); }
    }
    while (s1 !== peg$FAILED) {
      s0.push(s1);
      if (peg$c144.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c145); }
      }
    }
    peg$silentFails--;
    if (s0 === peg$FAILED) {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c143); }
    }

    return s0;
  }


    var regs = {
      A:0, B:1, C:2, D:3,
      XL:4, XH:5, YL:6, YH:7,
      X:20, Y:22
    };
    
    var opcodes = [
    'HLT',
    'ADD_R_R','ADD_R_RA','ADD_R_A','ADD_R_C',
    'SUB_R_R','SUB_R_RA','SUB_R_A','SUB_R_C',
    'MUL_R_R','MUL_R_RA','MUL_R_A','MUL_R_C',
    'DIV_R_R','DIV_R_RA','DIV_R_A','DIV_R_C',
    'INC_R','DEC_R',
    'AND_R_R','AND_R_RA','AND_R_A','AND_R_C',
    'OR_R_R','OR_R_RA','OR_R_A','OR_R_C',
    'XOR_R_R','XOR_R_RA','XOR_R_A','XOR_R_C',
    'SHL_R_R','SHL_R_RA','SHL_R_A','SHL_R_C',
    'SHR_R_R','SHR_R_RA','SHR_R_A','SHR_R_C',
    'MOV_R_R','MOV_R_RA','MOV_R_A','MOV_R_C',
    'MOV_RA_R','MOV_A_R','MOV_RA_C','MOV_A_C',
    'PUSH_R','PUSH_RA','PUSH_A','PUSH_C','POP_R',
    'JMP_RA','JMP_A','JMP_C',
    'JE_RA','JE_A','JE_C',
    'JNE_RA','JNE_A','JNE_C',
    'JG_RA','JG_A','JG_C',
    'JGE_RA','JGE_A','JGE_C',
    'JL_RA','JL_A','JL_C',
    'JLE_RA','JLE_A','JLE_C',
    'CMP_R_R','CMP_R_RA','CMP_R_A','CMP_R_C',
    'CALL_RA','CALL_A','CALL_C',
    'RET',
    'INT_C',
    'BRK',
    
    'ADD_R_CA','SUB_R_CA','MUL_R_CA','DIV_R_CA',
    'AND_R_CA','OR_R_CA','XOR_R_CA','SHL_R_CA','SHR_R_CA',
    'MOV_R_CA','MOV_CA_R','MOV_CA_C','CMP_R_CA',
    'PUSH_CA',
    'JMP_CA','JE_CA','JNE_CA','JG_CA','JGE_CA',
    'JL_CA','JLE_CA','CALL_CA'
  ];
    
    function buildInstr (mnem, args) {
    	return {
        opcode: opcodes.findIndex(function (o) { return o === mnem;}),
        mnem: mnem,
        args: args
      };
    }


  peg$result = peg$startRuleFunction();

  if (peg$result !== peg$FAILED && peg$currPos === input.length) {
    return peg$result;
  } else {
    if (peg$result !== peg$FAILED && peg$currPos < input.length) {
      peg$fail(peg$endExpectation());
    }

    throw peg$buildStructuredError(
      peg$maxFailExpected,
      peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
      peg$maxFailPos < input.length
        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
    );
  }
}

module.exports = {
  SyntaxError: peg$SyntaxError,
  parse:       peg$parse
};

},{}],11:[function(require,module,exports){
// polyfill lpad
String.prototype.lpad = function (length) {
  return ("0000" + this.toString()).slice(length * -1);
};

////////////////////////////////////////////////

var asmparser = require('./asmparser');

var CPU = require('./CPU');
var cpu = new CPU({
  output: document.getElementById('output')
});
window.cpu = cpu;

var Keyboard = require('./Devices/Keyboard');
// Install keyboard with buffer on 0xF5E1 and 256 bytes of buffer
cpu.installDevice(Keyboard, 0xF5E0, 256);

// Install sys interrupts
var sysInts = require('./SysInts');
cpu.assignInterrupt(0x1, sysInts)

// Bind labels to clock
cpu.clock.on('tick', function () {
  document.getElementById('meta-PC').innerHTML = cpu.PC.toString(16).lpad(4);
  document.getElementById('meta-SP').innerHTML = cpu.SP.toString(16).lpad(4);
  document.getElementById('meta-A').innerHTML = cpu.memory.readReg(0).toString(16).lpad(2);
  document.getElementById('meta-B').innerHTML = cpu.memory.readReg(1).toString(16).lpad(2);
  document.getElementById('meta-C').innerHTML = cpu.memory.readReg(2).toString(16).lpad(2);
  document.getElementById('meta-D').innerHTML = cpu.memory.readReg(3).toString(16).lpad(2);
  document.getElementById('meta-XL').innerHTML = cpu.memory.readReg(4).toString(16).lpad(2);
  document.getElementById('meta-XH').innerHTML = cpu.memory.readReg(5).toString(16).lpad(2);
  document.getElementById('meta-YL').innerHTML = cpu.memory.readReg(6).toString(16).lpad(2);
  document.getElementById('meta-YH').innerHTML = cpu.memory.readReg(7).toString(16).lpad(2);
  document.getElementById('meta-X').innerHTML = cpu.memory.readReg(20).toString(16).lpad(4);
  document.getElementById('meta-Y').innerHTML = cpu.memory.readReg(22).toString(16).lpad(4);
  
  document.getElementById('flag-C').innerHTML = (cpu.flags.carry) ? '1' : '0';
  document.getElementById('flag-P').innerHTML = (cpu.flags.parity) ? '1' : '0';
  document.getElementById('flag-Z').innerHTML = (cpu.flags.zero) ? '1' : '0';
  document.getElementById('flag-S').innerHTML = (cpu.flags.sign) ? '1' : '0';
  document.getElementById('flag-O').innerHTML = (cpu.flags.overflow) ? '1' : '0';
});

// Replace log
cpu.log = function () {
  if (this.debug) {
    var args = Array.prototype.slice.call(arguments);
    doLog(args.map(function (e) { return (typeof e === 'string') ? e : JSON.stringify(e) }).join("\t"));
  }
};

// Instantiate memviewer
var MemViewer = require('./MemViewer');
var mv = new MemViewer(document.getElementById('memMap'), cpu.memory._raw, 0);
mv.clock.on('tick', function () {
  document.getElementById('memMap-from').innerHTML = mv.offset.toString(16).lpad(4);
  document.getElementById('memMap-to').innerHTML = (mv.offset + mv.viewportLength).toString(16).lpad(4);
});
mv.start();
window.mv = mv;

// Bind some UI buttons
document.getElementById('ctrl-speed-up').addEventListener('click', function () {
  cpu.clock.speed += 10;
  doLog('Set speed to', cpu.clock.speed);
});
document.getElementById('ctrl-speed-down').addEventListener('click', function () {
  cpu.clock.speed -= 10;
  doLog('Set speed to', cpu.clock.speed);
});
document.getElementById('ctrl-speed-set').addEventListener('click', function () {
  cpu.clock.speed = parseInt(prompt('Set new clock speed:', '1000'), 10);
  doLog('Set speed to', cpu.clock.speed);
});
document.getElementById('ctrl-mv-up').addEventListener('click', function () {
  try {
    var off = mv.offset, newOffset = off + mv.viewportLength;
    mv.offset = newOffset;
    doLog('Set memviewer to', mv.offset.toString(16).lpad(4));
  } catch (e) {
    doLog('Memory limit reached in memviewer');
  }
});
document.getElementById('ctrl-mv-down').addEventListener('click', function () {
  try {
    var off = mv.offset, newOffset = off - mv.viewportLength;
    mv.offset = newOffset;
    doLog('Set memviewer to', mv.offset.toString(16).lpad(4));
  } catch (e) {
    doLog('Memory limit reached in memviewer');
  }
});
document.getElementById('ctrl-mv-set').addEventListener('click', function () {
  var newOffset = parseInt(prompt('Set new memview offset (hex): 0x', 'F5E0'), 16);
  if (isNaN(newOffset)) {
    doLog('Error! Offset', newOffset, 'is not a number');
    return;
  }
  mv.offset = newOffset;
  doLog('Set offset to', mv.offset);
});

// Bind hotkeys
window.addEventListener('keydown', function (e) {
  //console.log(e.which);
  // Ctrl C Compile
  if (e.ctrlKey && e.which === 67) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    cpu.halt();
    try {
      cpu.reset();
      var r = asmparser(document.getElementById('code-txt').value);
      cpu.loadProgram(Uint8Array.from(r.bytecode));
    } catch (e) {
      console.error(e);
      return;
    }
  }
  // Ctrl R to reset
  if (e.ctrlKey && e.which === 82) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    cpu.reset();
  }
  // Ctrl P to Pause/resume
  if (e.ctrlKey && e.which === 80) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (cpu.clock.timer !== null) {
      cpu.halt();
    } else {
      cpu.run();
    }
    e.preventDefault();
    return false;
  }
  // Ctrl D to debug
  if (e.ctrlKey && e.which === 68) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    cpu.toggleDebug();
    doLog('Set debug to:', cpu.debug);
    return false;
  }
});

},{"./CPU":1,"./Devices/Keyboard":4,"./MemViewer":5,"./SysInts":8,"./asmparser":9}]},{},[11]);
