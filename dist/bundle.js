(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
        var r = regCont - arg;
        this.setFlag('ZERO', (r === 0));
        this.setFlag('PARITY', (r & 0x1) === 1);
        break;
      case 4:
        log('SUB')
        // SUB
        var r = this.memory.writeReg(
          rr,
          this.memory.readReg(rr) - arg
        );
        this.setFlag('ZERO', (r === 0));
        this.setFlag('SIGN', (r >> 7));
        this.setFlag('PARITY', (r & 0x1) === 1);
        this.setFlag('CARRY', (r > 256));
        this.setFlag('OVERFLOW', (r > 256));
        break;
      case 5:
        log('ADD', rr, arg)
        // ADD
        var r = this.memory.writeReg(
          rr,
          this.memory.readReg(rr) + arg
        );
        this.setFlag('ZERO', (r === 0));
        this.setFlag('SIGN', (r >> 7));
        this.setFlag('PARITY', (r & 0x1) === 1);
        this.setFlag('CARRY', (r > 256));
        this.setFlag('OVERFLOW', (r > 256));
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
        }
        else if (mmm === 3) {
          // JLE
          log('JLE', addr);
        }
        else if (mmm === 4) {
          // JG
          log('JG', addr);
        }
        else if (mmm === 5) {
          // JGE
          log('JGE', addr);  
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

},{"../Memory":2,"../Screen":3}],2:[function(require,module,exports){
var Memory = function () {
  this._raw = new ArrayBuffer(8000);
  this.mem = new Uint8Array(this._raw, 0);
  this.registers = new Uint8Array(4);
  this.flags = 0x0;
  this.length = 8000;
  this.FLAG = {
    CARRY: 0x80,
    PARITY: 0x40,
    ZERO: 0x20,
    SIGN: 0x10,
    OVERFLOW: 0x08
  }
};

Memory.prototype.writeReg = function (reg, value) {
  if (reg >= this.registers.length) throw new Error('Invalid register');
  return this.registers[reg] = value;
};

Memory.prototype.readReg = function (reg) {
  if (reg >= this.registers.length) throw new Error('Invalid register');
  return this.registers[reg];
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

Memory.prototype.getFlag = function (flag) {
  if (this.FLAG[flag] === undefined) throw new Error('Invalid flag ' + flag);
  return this.flags & this.FLAG[flag];
};

Memory.prototype.setFlag = function (flag) {
  if (this.FLAG[flag] === undefined) throw new Error('Invalid flag ' + flag);
  return this.flags = this.flags | this.FLAG[flag];
};

Memory.prototype.resetFlag = function (flag) {
  if (this.FLAG[flag] === undefined) throw new Error('Invalid flag ' + flag);
  return this.flags = this.flags & ~this.FLAG[flag];
};

module.exports = Memory;

},{}],3:[function(require,module,exports){
var Screen = function (outputElement, screenMem) {
  this.pxSize = 4;
  this.el = outputElement;
  this.ctx = this.el.getContext('2d');
  this.setupElement();
  this.mem = screenMem;
};

Screen.prototype.setupElement = function () {
  this.el.width = this.realPxToscrPx(100).toString();
  this.el.height = this.realPxToscrPx(32).toString();
  this.clear();
};

Screen.prototype.realPxToscrPx = function (px) {
  return px * 4;
};

Screen.prototype.scrPxTorealPx = function (px) {
  return Math.floor(px / 4);
};

Screen.prototype.getColorHex = function (bits) {
  switch (bits) {
    case 0: return '#000000'; break;
    case 1: return '#AA0000'; break;
    case 2: return '#00AA00'; break;
    case 3: return '#FFFFFF'; break;
    default: return '#00AA00'; break;
  }
};

Screen.prototype.clear = function () {
  this.ctx.fillStyle = '#000000';
  this.ctx.fillRect(0,0,this.realPxToscrPx(100),this.realPxToscrPx(32));
};

Screen.prototype.putPx = function (x, y, color) {
  this.ctx.fillStyle = color;
  var rx = this.realPxToscrPx(x);
  var ry = this.realPxToscrPx(y);
  var pxwh = this.realPxToscrPx(1);
  this.ctx.fillRect(rx, ry, pxwh, pxwh);
};

Screen.prototype.render = function () {
  for (var offset = 0; offset < this.mem.length; offset++) {
    var byte = this.mem[offset];
    var px1 = (byte & 0xC0) >> 6, // 1100 0000
        px2 = (byte & 0x30) >> 4, // 0011 0000
        px3 = (byte & 0x0C) >> 2, // 0000 1100
        px4 = byte & 0x03; // 0000 0011
    var x1 = (offset % 25) * 4,
        x2 = x1 + 1,
        x3 = x1 + 2,
        x4 = x1 + 3;
    var y = Math.floor(offset / 25);
    this.putPx(x1, y, this.getColorHex(px1));
    this.putPx(x2, y, this.getColorHex(px2));
    this.putPx(x3, y, this.getColorHex(px3));
    this.putPx(x4, y, this.getColorHex(px4));
  }
};

module.exports = Screen;

},{}],4:[function(require,module,exports){
var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

var program = new Uint8Array([
  // 0b11000111, 0b00000101, // MOV A, 5
  // 0b11001111, 0b00001010, // MOV B, 10
  // 0b11100111, 0b00001111, // MOV [0xFF], A
  // 0b10100111, 0b00000010, // ADD A, 0x2
  // //0b00010000,  // NOT A
  // 0b00001110, 0b00000100  // JMP 0x4
  
  0b11000111, 0b00000101, // MOV A, 5
  0b01100111, 0b00000111, // CMP A, 7
  0b00001001, 0b00000111, // JNE 0x7
  0b00000000, // HLT
  0b11001111, 0b00001111, // MOV B, 0xF
  0b00000000, // HLT
]);

cpu.loadProgram(program);
cpu.run();

},{"./CPU":1}]},{},[4]);
