(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
          log('A',this.memory.readReg(regA), 'B',this.memory.readReg(regB));
          this.memory.writeReg(regA, this.memory.readReg(regA) + this.memory.readReg(regB));
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
},{"../Memory":3,"./opcodes":2}],2:[function(require,module,exports){
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
  'MOV_C_A',
  'MOV_C_RA',
  'PUSH_R',
  'PUSH_RA',
  'PUSH_A',
  'PUSH_C',
  'POP_R',
  'JMP_RA',
  'JMP_A',
  'JE_RA',
  'JE_A',
  'JNE_RA',
  'JNE_A',
  'JZ_RA',
  'JZ_A',
  'JG_RA',
  'JG_A',
  'JGE_RA',
  'JGE_A',
  'JL_RA',
  'JL_A',
  'JLE_RA',
  'JLE_A',
  'CMP_R_R',
  'CMP_R_RA',
  'CMP_R_A',
  'CMP_R_C',
  'CALL_RA',
  'CALL_A',
  'RET'
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
var Memory = function () {
  this._raw = new ArrayBuffer(64000);
  this.mem = new Uint8Array(this._raw, 0);
  this._registers = new ArrayBuffer(8);
  this.regs8 = new Uint8Array(this._registers, 0);
  this.regs16 = new Uint16Array(this._registers, 4);
  this.flags = {
    carry: false,
    parity: false,
    zero: false,
    sign: false,
    overflow: false
  };
};

Memory.prototype.writeReg = function (reg, value) {
  if (reg > 0xF) this.writeReg16((reg & 0xF), value);
  return this.writeReg8(reg, value);
};

Memory.prototype.readReg = function (reg, value) {
  if (reg > 0xF) this.readReg16((reg & 0xF), value);
  return this.readReg8(reg, value);
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
  return this.regs16[reg];
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

},{}],4:[function(require,module,exports){
var CPU = require('./CPU');

var output = document.getElementById('output');
var cpu = new CPU({
  output: output
});

window.cpu = cpu;

cpu.memory.writeReg(0x0, 123);
cpu.memory.writeReg(0x1, 1);

var program = new Uint8Array([
  0b00000001, // ADD r, r
  0b00000000,
  0b00000001,
  // 0b00000010,
  // 0b00000011,
  // 0b00000100,
  0b00000000
]);

cpu.loadProgram(program);
cpu.run();

},{"./CPU":1}]},{},[4]);
