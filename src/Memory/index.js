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
